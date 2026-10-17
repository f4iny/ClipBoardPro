// src/utils/i18n/LanguageProvider.jsx
import { useState, useEffect, useCallback, useMemo } from 'react';
import i18n from './i18n';
import { LanguageContext } from './LanguageContext';

export function LanguageProvider({ children, initialLanguage }) {
  const [language, setLanguageState] = useState(initialLanguage || i18n.getLanguage());
  const [isLoading, setIsLoading] = useState(true);

  // โหลดภาษาแบบ async แต่ไม่ block การ render children
  useEffect(() => {
    let mounted = true;

    const initializeLanguage = async () => {
      try {
        setIsLoading(true);
        const loadedLanguage = await i18n.init(initialLanguage);
        if (mounted) {
          setLanguageState(loadedLanguage);
          console.log('🌐 LanguageProvider: Loaded language:', loadedLanguage);
        }
      } catch (error) {
        console.error('Language load failed:', error);
        if (mounted) {
          setLanguageState(i18n.getLanguage());
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    initializeLanguage();
    return () => { mounted = false; };
  }, [initialLanguage]);

  // Subscribe language change จาก i18n
  useEffect(() => {
    const unsubscribe = i18n.subscribe((newLanguage) => {
      setLanguageState(newLanguage);
    });
    return unsubscribe;
  }, []);

  // ฟังก์ชันเปลี่ยนภาษาแบบ async
  const setLanguage = useCallback(async (lang) => {
    try {
      const success = await i18n.setLanguage(lang);
      if (success) {
        setLanguageState(lang);
        console.log('✅ LanguageProvider: Language set successfully');
        return true;
      }
      return false;
    } catch (error) {
      console.error('❌ Failed to set language:', error);
      return false;
    }
  }, []);

  const value = useMemo(() => ({
    language,
    setLanguage,
    t: i18n.t.bind(i18n),
    formatRelativeTime: i18n.formatRelativeTime.bind(i18n),
    getSupportedLanguages: i18n.getSupportedLanguages.bind(i18n),
    isLoading
  }), [language, setLanguage, isLoading]);

  return (
    <LanguageContext.Provider value={value}>
      {/* overlay loading ขณะโหลดภาษา */}
      {isLoading && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0,
          width: '100%',
          height: '100%',
          backgroundColor: 'var(--color-background, rgba(0,0,0,0.8))',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 9999,
          color: '#ccc',
          fontSize: '14px'
        }}>
          <div style={{
            width: '20px',
            height: '20px',
            border: '2px solid #333',
            borderTop: '2px solid #666',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            marginBottom: '10px'
          }} />
          Loading language...
          <style>
            {`@keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }`}
          </style>
        </div>
      )}
      {children}
    </LanguageContext.Provider>
  );
}

export default LanguageProvider;
