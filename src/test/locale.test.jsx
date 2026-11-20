import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LocaleProvider, useLocale } from '../context/LocaleContext';

function TestConsumer() {
  const { locale, setLocale, t } = useLocale();
  return (
    <div>
      <span data-testid="current-locale">{locale}</span>
      <h1 data-testid="headline">{t('hero.headline')}</h1>
      <button data-testid="set-kn" onClick={() => setLocale('kn')}>Switch to Kannada</button>
      <button data-testid="set-hi" onClick={() => setLocale('hi')}>Switch to Hindi</button>
      <button data-testid="set-en" onClick={() => setLocale('en')}>Switch to English</button>
      <span data-testid="fallback">{t('non.existent.key', 'Fallback String')}</span>
    </div>
  );
}

describe('LocaleContext and Translations', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to English and renders English strings', () => {
    render(
      <LocaleProvider>
        <TestConsumer />
      </LocaleProvider>
    );
    expect(screen.getByTestId('current-locale').textContent).toBe('en');
    expect(screen.getByTestId('headline').textContent).toBe('Good Food Deserves a Second Chance.');
  });

  it('switches to Kannada and renders Kannada translations', () => {
    render(
      <LocaleProvider>
        <TestConsumer />
      </LocaleProvider>
    );
    fireEvent.click(screen.getByTestId('set-kn'));
    expect(screen.getByTestId('current-locale').textContent).toBe('kn');
    expect(screen.getByTestId('headline').textContent).toContain('ಉತ್ತಮ ಆಹಾರಕ್ಕೆ ಎರಡನೇ ಅವಕಾಶ ಸಿಗಬೇಕು.');
    expect(localStorage.getItem('foodbridge_locale')).toBe('kn');
  });

  it('switches to Hindi and renders Hindi translations', () => {
    render(
      <LocaleProvider>
        <TestConsumer />
      </LocaleProvider>
    );
    fireEvent.click(screen.getByTestId('set-hi'));
    expect(screen.getByTestId('current-locale').textContent).toBe('hi');
    expect(screen.getByTestId('headline').textContent).toContain('अच्छे भोजन को दूसरा मौका मिलना चाहिए।');
    expect(localStorage.getItem('foodbridge_locale')).toBe('hi');
  });

  it('returns fallback string when key is not found', () => {
    render(
      <LocaleProvider>
        <TestConsumer />
      </LocaleProvider>
    );
    expect(screen.getByTestId('fallback').textContent).toBe('Fallback String');
  });
});
