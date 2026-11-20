import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import {
  auth,
  db,
  googleProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from '../services/firebase';

const CACHE_USER_KEY = 'foodbridge_cached_user_doc';
const CACHE_ROLE_KEY = 'foodbridge_cached_role_profile';

/**
 * Safe local storage reader for synchronous state hydration
 */
function getCachedDoc(key) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

/**
 * Safe local storage writer
 */
function setCachedDoc(key, data) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    if (data) {
      window.localStorage.setItem(key, JSON.stringify(data));
    } else {
      window.localStorage.removeItem(key);
    }
  } catch (e) {
    // Gracefully handle storage quota or private browsing limits
  }
}

/**
 * Maps a user's completed profile and active role to their primary dashboard route.
 */
export function getUserDashboardRoute(userDoc) {
  if (!userDoc || !userDoc.onboardingComplete) {
    return '/onboarding';
  }
  if (userDoc.isAdmin || userDoc.roles?.includes('admin')) {
    return '/admin/verification';
  }
  const role = userDoc.activeRole || (userDoc.roles && userDoc.roles[0]);
  if (role === 'recipient') return '/recipient/dashboard';
  if (role === 'delivery') return '/delivery/dashboard';
  if (role === 'donor') return '/donor/dashboard';
  if (role === 'visitor') return '/';
  return '/';
}

/**
 * Wraps a Firestore Promise with a timeout to prevent hanging UI on slow networks.
 * Distinguishes timeouts/errors from legitimate missing documents.
 */
function fetchWithTimeout(promise, ms = 6000) {
  let timer;
  const timeoutPromise = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ isTimeout: true, isError: false, data: null }), ms);
  });
  return Promise.race([
    promise.then((res) => {
      clearTimeout(timer);
      return { data: res, isTimeout: false, isError: false };
    }).catch((err) => {
      clearTimeout(timer);
      console.warn('Firestore fetch caught fallback:', err.message);
      return { data: null, isTimeout: false, isError: true, error: err };
    }),
    timeoutPromise
  ]);
}

export const AuthContext = createContext({
  user: null,
  userDoc: null,
  profileData: null,
  loading: true,
  isAdmin: false,
  isVerified: false,
  registerWithEmail: async () => {},
  loginWithEmail: async () => {},
  loginWithGoogle: async () => {},
  sendPasswordReset: async () => {},
  logout: async () => {},
  switchActiveRole: async () => {},
  completeOnboarding: async () => {},
  refreshUserProfile: async () => {}
});

export function AuthProvider({ children }) {
  // Synchronously hydrate from localStorage to render in 0ms on page reload
  const initialUserDoc = getCachedDoc(CACHE_USER_KEY);
  const initialProfile = getCachedDoc(CACHE_ROLE_KEY);

  const [user, setUser] = useState(auth.currentUser || null);
  const [userDoc, setUserDoc] = useState(initialUserDoc);
  const [profileData, setProfileData] = useState(initialProfile);
  // If we already have a cached userDoc, don't block the UI with a full-screen spinner
  const [loading, setLoading] = useState(() => !initialUserDoc);

  // In-flight deduplication ref to prevent duplicate simultaneous Firestore calls
  const inFlightFetchRef = useRef(null);
  const userDocRef = useRef(initialUserDoc);

  // Keep userDocRef in sync with state for immediate synchronous lookups
  useEffect(() => {
    userDocRef.current = userDoc;
  }, [userDoc]);

  /**
   * Fetches user document and active role profile from Firestore with deduplication & timeout safety.
   * NEVER overwrites existing roles or completed onboarding status when network is slow or offline.
   */
  const fetchUserData = async (currentUser, force = false) => {
    if (!currentUser) {
      setUserDoc(null);
      setProfileData(null);
      setCachedDoc(CACHE_USER_KEY, null);
      setCachedDoc(CACHE_ROLE_KEY, null);
      return null;
    }

    // Reuse in-memory userDoc if already matching and not forced
    if (!force && userDocRef.current && userDocRef.current.uid === currentUser.uid) {
      return userDocRef.current;
    }

    // Deduplicate identical concurrent fetch requests
    if (!force && inFlightFetchRef.current && inFlightFetchRef.current.uid === currentUser.uid) {
      return inFlightFetchRef.current.promise;
    }

    const fetchPromise = (async () => {
      try {
        const userRef = doc(db, 'users', currentUser.uid);
        const fetchRes = await fetchWithTimeout(getDoc(userRef), 6000);

        // If fetch timed out or failed temporarily, DO NOT overwrite existing user document!
        if (fetchRes.isTimeout || fetchRes.isError) {
          console.warn('Firestore user fetch unavailable (timeout or error). Preserving current session.');
          const existing = userDocRef.current || getCachedDoc(CACHE_USER_KEY);
          if (existing && existing.uid === currentUser.uid) {
            setUserDoc(existing);
            return existing;
          }
          return userDocRef.current;
        }

        const userSnap = fetchRes.data;
        let uData = null;

        if (userSnap && typeof userSnap.exists === 'function' && userSnap.exists()) {
          uData = userSnap.data();
          setUserDoc(uData);
          setCachedDoc(CACHE_USER_KEY, uData);

          // If user document already embeds profileData, hydrate immediately
          if (uData.profileData) {
            setProfileData(uData.profileData);
            setCachedDoc(CACHE_ROLE_KEY, uData.profileData);
          }

          // Fetch secondary role collection document if needed
          const activeRole = uData.activeRole || (uData.roles && uData.roles[0]);
          if (activeRole && uData.onboardingComplete) {
            let colName = '';
            if (activeRole === 'recipient') colName = 'recipients';
            else if (activeRole === 'delivery') colName = 'deliveryPartners';
            else if (activeRole === 'donor') colName = 'donors';

            if (colName) {
              const roleRef = doc(db, colName, currentUser.uid);
              const roleRes = await fetchWithTimeout(getDoc(roleRef), 4000);
              if (!roleRes.isTimeout && !roleRes.isError && roleRes.data && roleRes.data.exists()) {
                const rData = roleRes.data.data();
                setProfileData(rData);
                setCachedDoc(CACHE_ROLE_KEY, rData);
              }
            }
          }
        } else {
          // Document does not exist yet on Firestore server (new user)
          // Safety Check: Never overwrite if local cache or ref already has a completed onboarding profile!
          const existingLocal = userDocRef.current || getCachedDoc(CACHE_USER_KEY);
          if (existingLocal && existingLocal.uid === currentUser.uid && (existingLocal.onboardingComplete || existingLocal.activeRole)) {
            console.info('Restoring completed profile from local state to Firestore.');
            setUserDoc(existingLocal);
            setDoc(userRef, {
              ...existingLocal,
              updatedAt: serverTimestamp()
            }, { merge: true }).catch((err) => {
              console.warn('Profile restore sync notice:', err.message);
            });
            return existingLocal;
          }

          // Genuine first-time user
          const initialDoc = {
            uid: currentUser.uid,
            email: currentUser.email,
            roles: [],
            activeRole: null,
            onboardingComplete: false,
            isAdmin: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          setUserDoc(initialDoc);
          setCachedDoc(CACHE_USER_KEY, initialDoc);
          setProfileData(null);
          setCachedDoc(CACHE_ROLE_KEY, null);
          uData = initialDoc;

          // Asynchronously persist minimal profile in background without blocking UI
          setDoc(userRef, {
            ...initialDoc,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          }, { merge: true }).catch((err) => {
            console.warn('Initial user profile background creation notice:', err.message);
          });
        }
        return uData;
      } catch (err) {
        console.warn('Firestore profile retrieval error:', err.message);
        const existing = userDocRef.current || getCachedDoc(CACHE_USER_KEY);
        if (existing && existing.uid === currentUser.uid) {
          return existing;
        }
        return userDocRef.current;
      } finally {
        inFlightFetchRef.current = null;
      }
    })();

    inFlightFetchRef.current = { uid: currentUser.uid, promise: fetchPromise };
    return fetchPromise;
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Fast-path: if local cache matches this user, unblock loading immediately
        const cached = getCachedDoc(CACHE_USER_KEY);
        if (cached && cached.uid === currentUser.uid) {
          setUserDoc(cached);
          userDocRef.current = cached;
          setLoading(false);
          // Revalidate quietly in background (Stale-While-Revalidate pattern)
          fetchUserData(currentUser, true).catch(() => {});
        } else {
          // New sign in or first session on this device
          await fetchUserData(currentUser);
          setLoading(false);
        }
      } else {
        setUserDoc(null);
        userDocRef.current = null;
        setProfileData(null);
        setCachedDoc(CACHE_USER_KEY, null);
        setCachedDoc(CACHE_ROLE_KEY, null);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const refreshUserProfile = async () => {
    if (user) {
      await fetchUserData(user, true);
    }
  };

  /**
   * Fast-path registration:
   * 1. Creates Firebase Auth user.
   * 2. Sets in-memory user, userDoc state, and localStorage cache immediately.
   * 3. Unblocks loading instantly so UI routes without 2-minute delay.
   * 4. Persists initial document to Firestore in background.
   */
  const registerWithEmail = async (email, password) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const initialDoc = {
      uid: cred.user.uid,
      email: cred.user.email,
      roles: [],
      activeRole: null,
      onboardingComplete: false,
      isAdmin: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Immediately update state and in-memory cache to unblock UI instantly
    setUser(cred.user);
    setUserDoc(initialDoc);
    userDocRef.current = initialDoc;
    setCachedDoc(CACHE_USER_KEY, initialDoc);
    setProfileData(null);
    setCachedDoc(CACHE_ROLE_KEY, null);
    setLoading(false);

    // Save initial document in background with non-blocking error handling and merge: true
    setDoc(doc(db, 'users', cred.user.uid), {
      ...initialDoc,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true }).catch((err) => {
      console.warn('Background initial user write notice:', err.message);
    });

    const returnUser = cred.user;
    returnUser.userDoc = initialDoc;
    return returnUser;
  };

  /**
   * Fast-path email/password login:
   * 1. Authenticates against Firebase Auth.
   * 2. Fetches user document with timeout & deduplication.
   */
  const loginWithEmail = async (email, password) => {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const uDoc = await fetchUserData(cred.user);
    const returnUser = cred.user;
    returnUser.userDoc = uDoc;
    return returnUser;
  };

  /**
   * Fast-path Google authentication:
   * 1. Opens Google auth popup.
   * 2. Retrieves profile with automatic background document creation for new users.
   */
  const loginWithGoogle = async () => {
    const cred = await signInWithPopup(auth, googleProvider);
    const uDoc = await fetchUserData(cred.user);
    const returnUser = cred.user;
    returnUser.userDoc = uDoc;
    return returnUser;
  };

  const sendPasswordReset = async (email) => {
    return sendPasswordResetEmail(auth, email);
  };

  /**
   * Clean session logout:
   * Clears Firebase auth, in-memory states, localStorage caches, and pending fetch refs.
   */
  const logout = async () => {
    await signOut(auth);
    setUser(null);
    setUserDoc(null);
    userDocRef.current = null;
    setProfileData(null);
    setCachedDoc(CACHE_USER_KEY, null);
    setCachedDoc(CACHE_ROLE_KEY, null);
    inFlightFetchRef.current = null;
  };

  const switchActiveRole = async (newRole) => {
    if (!user || !userDoc) return;
    if (!userDoc.roles.includes(newRole) && !userDoc.isAdmin) {
      throw new Error(`Role ${newRole} is not assigned to this account`);
    }

    const updatedUserDoc = {
      ...userDoc,
      activeRole: newRole,
      updatedAt: new Date().toISOString()
    };
    setUserDoc(updatedUserDoc);
    userDocRef.current = updatedUserDoc;
    setCachedDoc(CACHE_USER_KEY, updatedUserDoc);

    const userRef = doc(db, 'users', user.uid);
    setDoc(userRef, {
      activeRole: newRole,
      updatedAt: serverTimestamp()
    }, { merge: true }).catch((err) => {
      console.warn('Background switch role write notice:', err.message);
    });

    let colName = '';
    if (newRole === 'recipient') colName = 'recipients';
    else if (newRole === 'delivery') colName = 'deliveryPartners';
    else if (newRole === 'donor') colName = 'donors';

    if (colName) {
      const roleRef = doc(db, colName, user.uid);
      const roleRes = await fetchWithTimeout(getDoc(roleRef), 4000);
      if (!roleRes.isTimeout && !roleRes.isError && roleRes.data && roleRes.data.exists()) {
        const rData = roleRes.data.data();
        setProfileData(rData);
        setCachedDoc(CACHE_ROLE_KEY, rData);
      }
    }
  };

  /**
   * Permanent onboarding completion:
   * 1. Updates memory state and localStorage cache synchronously.
   * 2. Saves selected role, onboarding status, AND profile data directly into users/{uid} permanently.
   * 3. Saves role-specific document into dedicated collections (donors, recipients, deliveryPartners).
   * 4. Ensures returning users and refreshes restore completed onboarding reliably.
   */
  const completeOnboarding = async ({ selectedRole, selectedRoles, activeRole, donorData, recipientData, deliveryData }) => {
    if (!user) throw new Error('Must be signed in to complete onboarding');

    // Normalize role: support both single selectedRole and legacy selectedRoles
    const chosenRole = selectedRole || (selectedRoles && selectedRoles[0]) || activeRole || 'donor';
    const sanitizedRole = ['donor', 'recipient', 'delivery', 'visitor'].includes(chosenRole) ? chosenRole : 'visitor';

    const nowIso = new Date().toISOString();

    // Prepare role-specific document
    let roleProfile = null;
    let roleWritePromise = Promise.resolve();

    if (sanitizedRole === 'donor' && donorData) {
      roleProfile = {
        userId: user.uid,
        email: user.email,
        ...donorData
      };
      const donorRef = doc(db, 'donors', user.uid);
      roleWritePromise = setDoc(donorRef, {
        ...roleProfile,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }, { merge: true });
    } else if (sanitizedRole === 'recipient' && recipientData) {
      roleProfile = {
        userId: user.uid,
        email: user.email,
        ...recipientData,
        verificationStatus: 'pending',
        verifiedAt: null,
        verifiedBy: null,
        rejectionReason: null
      };
      const recipientRef = doc(db, 'recipients', user.uid);
      roleWritePromise = setDoc(recipientRef, {
        ...roleProfile,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }, { merge: true });
    } else if (sanitizedRole === 'delivery' && deliveryData) {
      roleProfile = {
        userId: user.uid,
        email: user.email,
        ...deliveryData,
        verificationStatus: 'pending',
        verifiedAt: null,
        verifiedBy: null,
        rejectionReason: null
      };
      const deliveryRef = doc(db, 'deliveryPartners', user.uid);
      roleWritePromise = setDoc(deliveryRef, {
        ...roleProfile,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }, { merge: true });
    }

    const updatedUserDoc = {
      ...(userDoc || {}),
      uid: user.uid,
      email: user.email,
      roles: [sanitizedRole],
      activeRole: sanitizedRole,
      onboardingComplete: true,
      updatedAt: nowIso,
      profileData: roleProfile || null,
      ...(roleProfile ? {
        organizationName: roleProfile.organizationName || roleProfile.fullName || '',
        contactPhone: roleProfile.phone || '',
        district: roleProfile.district || roleProfile.serviceDistrict || 'Bengaluru Urban',
        verificationStatus: roleProfile.verificationStatus || (sanitizedRole === 'donor' || sanitizedRole === 'visitor' ? 'verified' : 'pending')
      } : {})
    };

    // Synchronously update in-memory state and localStorage cache
    setUserDoc(updatedUserDoc);
    userDocRef.current = updatedUserDoc;
    setCachedDoc(CACHE_USER_KEY, updatedUserDoc);

    if (roleProfile) {
      setProfileData(roleProfile);
      setCachedDoc(CACHE_ROLE_KEY, roleProfile);
    } else {
      setProfileData(null);
      setCachedDoc(CACHE_ROLE_KEY, null);
    }

    // Permanently write to users collection in Firestore with merge: true
    const userRef = doc(db, 'users', user.uid);
    const userWritePromise = setDoc(userRef, {
      ...updatedUserDoc,
      updatedAt: serverTimestamp()
    }, { merge: true });

    // Race writes against a 1500ms ceiling so slow networks NEVER block UI navigation
    await Promise.race([
      Promise.all([userWritePromise, roleWritePromise]),
      new Promise((resolve) => setTimeout(resolve, 1500))
    ]).catch((err) => {
      console.warn('Onboarding permanent write background notice:', err.message);
    });

    return updatedUserDoc;
  };

  const isAdmin = Boolean(userDoc?.isAdmin || userDoc?.roles?.includes('admin'));

  const isVerified = (() => {
    if (!userDoc) return false;
    if (isAdmin) return true;
    if (userDoc.activeRole === 'donor' || userDoc.activeRole === 'visitor') return true;
    const status = profileData?.verificationStatus || userDoc?.verificationStatus;
    return status === 'verified';
  })();

  return (
    <AuthContext.Provider
      value={{
        user,
        userDoc,
        profileData,
        loading,
        isAdmin,
        isVerified,
        registerWithEmail,
        loginWithEmail,
        loginWithGoogle,
        sendPasswordReset,
        logout,
        switchActiveRole,
        completeOnboarding,
        refreshUserProfile
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
