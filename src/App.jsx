import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import Header from './components/Header'
import TitleBar from './components/TitleBar'
import ClipboardHistory from './components/ClipboardHistory'
import Footer from './components/Footer'
import EditModal from './components/EditModal'
import SettingsModal from './components/SettingsModal'
import ThemeBuilder from './components/ThemeBuilder'
import { LanguageProvider } from './utils/i18n'
import { themeManager } from './utils/themeManager'
import './scss/App.scss'

// Disable DevTools and Context Menu
window.addEventListener('contextmenu', e => e.preventDefault());
window.addEventListener('keydown', e => {
  // Disable F12
  if (e.key === 'F12') {
    e.preventDefault();
    return false;
  }
  
  // Disable Ctrl+Shift+I
  if (e.ctrlKey && e.shiftKey && e.key === 'I') {
    e.preventDefault();
    return false;
  }
  
  // Disable Ctrl+Shift+J
  if (e.ctrlKey && e.shiftKey && e.key === 'J') {
    e.preventDefault();
    return false;
  }
  
  // Disable Ctrl+U
  if (e.ctrlKey && e.key === 'u') {
    e.preventDefault();
    return false;
  }
  
  // Disable Ctrl+S
  if (e.ctrlKey && e.key === 's') {
    e.preventDefault();
    return false;
  }
});

function App() {
  const [loading, setLoading] = useState(true)
  const [clipboardHistory, setClipboardHistory] = useState([])
  const [filter, setFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState('grid')
  const [editingitem, setEditingitem] = useState(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showThemeBuilder, setShowThemeBuilder] = useState(false)
  
  // Theme States
  const [theme, setTheme] = useState('dark')
  const [availableThemes, setAvailableThemes] = useState(['dark', 'light'])
  const [isThemeChanging, setIsThemeChanging] = useState(false)
  
  // Other states
  const [language, setLanguage] = useState('en')
  const [closeBehavior, setCloseBehavior] = useState('minimize')
  const [startMinimized, setStartMinimized] = useState(false)
  const [autoStart, setAutoStart] = useState(true)
  const [showTrayNotifications, setShowTrayNotifications] = useState(true)
  const [quickAccessHotkey, setQuickAccessHotkey] = useState('Ctrl+Shift+X')
  const [clearAllHotkey, setClearAllHotkey] = useState('Ctrl+Shift+Delete')
  const [maxHistoryItems, setMaxHistoryItems] = useState(() => {
    try {
      const saved = localStorage.getItem('appSettings')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed.maxHistoryItems) {
          return Number(parsed.maxHistoryItems)
        }
      }
    } catch {
      // Fallback to default
    }
    return 50
  })

  // Refs for performance optimization
  const maxHistoryItemsRef = useRef(maxHistoryItems)
  const debounceRef = useRef(null)
  const lastContentRef = useRef('')
  const lastTypeRef = useRef('')
  const isUpdatingRef = useRef(false)
  const updateQueueRef = useRef([])

  // Initialize theme manager and load available themes
  useEffect(() => {
    const initializeThemes = async () => {
      try {
        // Load available themes from theme manager
        const themes = themeManager.getAvailableThemes()
        setAvailableThemes(themes)
        
        // Get current theme
        const currentTheme = themeManager.getCurrentTheme()
        setTheme(currentTheme)
        
        // Apply current theme with smooth transition
        await themeManager.applyTheme(currentTheme)
        
        console.log('✅ Available themes:', themes)
        console.log('✅ Current theme:', currentTheme)
      } catch (error) {
        console.error('❌ Failed to initialize themes:', error)
        // Fallback to dark theme
        setTheme('dark')
        await themeManager.applyTheme('dark')
      }
    }

    initializeThemes()
  }, [])

  // Listen for theme changes from theme manager
  useEffect(() => {
    const handleThemeChange = (event) => {
      const { theme: newTheme } = event.detail
      console.log(`🎨 Theme changed event received: ${newTheme}`)
      
      setTheme(newTheme)
      setIsThemeChanging(false)
      
      // Refresh available themes list
      const themes = themeManager.getAvailableThemes()
      setAvailableThemes(themes)
    }

    window.addEventListener('themeChanged', handleThemeChange)
    return () => {
      window.removeEventListener('themeChanged', handleThemeChange)
    }
  }, [])

  // Initialize Auto Start setting
  useEffect(() => {
    const initializeAutoStart = async () => {
      if (window.electronAPI && window.electronAPI.getAutoStart) {
        try {
          const currentAutoStart = await window.electronAPI.getAutoStart()
          setAutoStart(currentAutoStart)
          
          if (!currentAutoStart) {
            console.log('Setting auto start as default...')
            await window.electronAPI.setAutoStart(true)
            setAutoStart(true)
          }
        } catch (error) {
          console.error('Failed to initialize auto start:', error)
          try {
            await window.electronAPI.setAutoStart(true)
            setAutoStart(true)
          } catch (setError) {
            console.error('Failed to set default auto start:', setError)
          }
        }
      }
    }

    initializeAutoStart()
  }, [])

  // Enhanced theme change handler with smooth transitions
  const handleThemeChange = useCallback(async (newTheme) => {
    if (newTheme === theme || isThemeChanging) {
      console.log(`⏸️ Skipping theme change: ${newTheme} (current: ${theme}, changing: ${isThemeChanging})`)
      return
    }
    
    try {
      console.log(`🎨 Starting theme change to: ${newTheme}`)
      setIsThemeChanging(true)
      
      // Add loading class to body for smooth transition
      document.body.classList.add('theme-loading')
      
      // Apply theme through theme manager
      await themeManager.applyTheme(newTheme)
      
      // Update local state
      setTheme(newTheme)
      
      console.log(`✅ Theme successfully changed to: ${newTheme}`)
      
      // Remove loading class after a short delay
      setTimeout(() => {
        document.body.classList.remove('theme-loading')
        setIsThemeChanging(false)
      }, 200)
      
    } catch (error) {
      console.error('❌ Failed to change theme:', error)
      document.body.classList.remove('theme-loading')
      setIsThemeChanging(false)
      
      // Revert to previous theme on error
      try {
        await themeManager.applyTheme(theme)
      } catch (revertError) {
        console.error('❌ Failed to revert theme:', revertError)
      }
    }
  }, [theme, isThemeChanging])

  // Refresh themes list (called after saving/deleting themes)
  const refreshThemes = useCallback(() => {
    try {
      const themes = themeManager.getAvailableThemes()
      setAvailableThemes(themes)
      console.log('🔄 Themes list refreshed:', themes)
    } catch (error) {
      console.error('❌ Failed to refresh themes:', error)
    }
  }, [])

  // Generate unique ID for clipboard items
  const generateId = useCallback(() => Math.random().toString(36).substr(2, 9), [])

  // Content type detection
  const detectContentType = useCallback((content, type = null) => {
    if (type === 'image' || (typeof content === 'string' && content.endsWith('.png'))) {
      return 'image'
    }

    if (content.startsWith('data:image/') && content.length > 1000) {
      return 'image'
    }
    
    if (content.startsWith('data:image/') && content.includes('base64') && content.length > 1000) {
      return 'image'
    }
    
    const codePatterns = [
      /function\s+\w+\s*\(/,
      /const\s+\w+\s*=/,
      /let\s+\w+\s*=/,
      /var\s+\w+\s*=/,
      /import\s+.*from/,
      /export\s+(default\s+)?/,
      /class\s+\w+/,
      /<\/?[a-z][\s\S]*>/i,
      /\{\s*\w+\s*:\s*\w+/,
      /if\s*\(/,
      /for\s*\(/,
      /while\s*\(/,
      /function\s*\(/,
      /=>\s*\{/,
      /console\./,
      /document\./,
      /window\./
    ]
    
    if (codePatterns.some(pattern => pattern.test(content))) {
      return 'code'
    }
    
    return 'text'
  }, [])

  // Process clipboard queue
  const processClipboardQueue = useCallback(() => {
    if (updateQueueRef.current.length === 0 || isUpdatingRef.current) {
      return
    }

    isUpdatingRef.current = true
    const latestUpdate = updateQueueRef.current.pop()
    updateQueueRef.current = []

    const { data } = latestUpdate

    if (data.content === lastContentRef.current && data.type === lastTypeRef.current) {
      isUpdatingRef.current = false
      return
    }

    const contentType = detectContentType(data.content, data.type)
    const newItem = {
      id: generateId(),
      content: data.content,
      type: contentType,
      timestamp: data.timestamp,
      preview: contentType === 'image' 
        ? data.content 
        : data.content.length > 100 
          ? data.content.substring(0, 100) + '...' 
          : data.content
    }

    setClipboardHistory(prev => {
      const latestItem = prev[0]
      if (latestItem && latestItem.content === data.content) {
        isUpdatingRef.current = false
        return prev
      }

      lastContentRef.current = data.content
      lastTypeRef.current = data.type
      isUpdatingRef.current = false
      
      const limit = maxHistoryItemsRef.current || 50
      const maxPrev = Math.max(0, limit - 1)
      const dropped = prev.slice(maxPrev)
      dropped.forEach(d => {
        if (d && d.type === 'image' && d.content && window.electronAPI?.media?.delete) {
          window.electronAPI.media.delete(d.content)
        }
      })

      return [newItem, ...prev.slice(0, maxPrev)]
    })
  }, [detectContentType, generateId])

  // Add clipboard item to queue
  const addClipboardItem = useCallback((data) => {
    updateQueueRef.current.push({ data, timestamp: Date.now() })

    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    debounceRef.current = setTimeout(processClipboardQueue, 300)
  }, [processClipboardQueue])

  // Load settings from localStorage with theme handling
  useEffect(() => {
    const savedSettings = localStorage.getItem('appSettings')
    if (savedSettings) {
      try {
        const settings = JSON.parse(savedSettings)
        if (settings.language) setLanguage(settings.language)
        if (settings.viewMode) setViewMode(settings.viewMode)
        if (settings.closeBehavior) setCloseBehavior(settings.closeBehavior)
        if (settings.startMinimized !== undefined) setStartMinimized(settings.startMinimized)
        if (settings.showTrayNotifications !== undefined) setShowTrayNotifications(settings.showTrayNotifications)
        if (settings.quickAccessHotkey) setQuickAccessHotkey(settings.quickAccessHotkey)
        if (settings.clearAllHotkey) setClearAllHotkey(settings.clearAllHotkey)
        if (settings.maxHistoryItems) setMaxHistoryItems(Number(settings.maxHistoryItems))
        if (settings.autoStart !== undefined) {
          setAutoStart(settings.autoStart)
        } else {
          setAutoStart(true)
        }
        
        // Load theme only if it exists in available themes and is different from current
        if (settings.theme && 
            availableThemes.includes(settings.theme) && 
            settings.theme !== theme) {
          console.log(`🎨 Loading saved theme: ${settings.theme}`)
          handleThemeChange(settings.theme)
        }
      } catch (error) {
        console.error('Error loading settings:', error)
        setAutoStart(true)
      }
    } else {
      setAutoStart(true)
    }
  }, [availableThemes, handleThemeChange, theme])

  // Save settings to localStorage
  useEffect(() => {
    const settings = {
      theme,
      language,
      viewMode,
      closeBehavior,
      startMinimized,
      autoStart,
      showTrayNotifications,
      quickAccessHotkey,
      clearAllHotkey,
      maxHistoryItems
    }
    localStorage.setItem('appSettings', JSON.stringify(settings))
  }, [theme, language, viewMode, closeBehavior, startMinimized, autoStart, showTrayNotifications, quickAccessHotkey, clearAllHotkey, maxHistoryItems])

  // Keep maxHistoryItemsRef in sync and prune history if limit reduced
  useEffect(() => {
    maxHistoryItemsRef.current = maxHistoryItems
    setClipboardHistory(prev => {
      if (prev.length > maxHistoryItems) {
        const dropped = prev.slice(maxHistoryItems)
        dropped.forEach(d => {
          if (d && d.type === 'image' && d.content && window.electronAPI?.media?.delete) {
            window.electronAPI.media.delete(d.content)
          }
        })
        return prev.slice(0, maxHistoryItems)
      }
      return prev
    })
  }, [maxHistoryItems])

  // Send hotkeys to main process
  useEffect(() => {
    if (window.electronAPI && window.electronAPI.updateHotkeys) {
      window.electronAPI.updateHotkeys({
        quickAccess: quickAccessHotkey,
        clearAll: clearAllHotkey
      })
    }
  }, [quickAccessHotkey, clearAllHotkey])

  // Send close behavior to main process
  useEffect(() => {
    if (window.electronAPI && window.electronAPI.setCloseBehavior) {
      window.electronAPI.setCloseBehavior(closeBehavior)
    }
  }, [closeBehavior])

  // Send auto start setting to main process
  useEffect(() => {
    if (window.electronAPI && window.electronAPI.setAutoStart) {
      window.electronAPI.setAutoStart(autoStart)
    }
  }, [autoStart])

  // Load clipboard history
  useEffect(() => {
    const saved = localStorage.getItem('clipboardHistory')
    if (saved) {
      try {
        const savedData = JSON.parse(saved)
        setClipboardHistory(savedData)
        if (savedData.length > 0) {
          lastContentRef.current = savedData[0].content
          lastTypeRef.current = savedData[0].type
        }
        const activeImages = savedData
          .filter(item => item.type === 'image' && item.content)
          .map(item => item.content)
        if (window.electronAPI?.media?.reconcile) {
          window.electronAPI.media.reconcile(activeImages)
        }
      } catch {
        setClipboardHistory([])
      }
    }
    setLoading(false)
  }, [])

  // Clear history handler
  const clearHistory = useCallback(() => {
    if (window.electronAPI?.media?.clearAll) {
      window.electronAPI.media.clearAll()
    }
    setClipboardHistory([])
    localStorage.removeItem('clipboardHistory')
    lastContentRef.current = ''
    lastTypeRef.current = ''
    updateQueueRef.current = []
  }, [])

  // Set up clipboard monitoring (LOW-02: dead browser fallback stripped)
  useEffect(() => {
    if (!window.electronAPI?.clipboard) return;

    window.electronAPI.clipboard.startMonitoring();
    const unsubscribeClipboard = window.electronAPI.clipboard.onChange(addClipboardItem);
    const unsubscribeClearAll = window.electronAPI.onClearAllShortcut?.(clearHistory);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      updateQueueRef.current = [];
      window.electronAPI.clipboard.stopMonitoring();
      if (unsubscribeClipboard) unsubscribeClipboard();
      if (unsubscribeClearAll) unsubscribeClearAll();
    };
  }, [addClipboardItem, clearHistory]);

  // Save to localStorage
  useEffect(() => {
    const saveToStorage = setTimeout(() => {
      if (clipboardHistory.length > 0) {
        localStorage.setItem('clipboardHistory', JSON.stringify(clipboardHistory))
      }
    }, 1000)

    return () => clearTimeout(saveToStorage)
  }, [clipboardHistory])

  // Filtered history
  const filteredHistory = useMemo(() => {
    return clipboardHistory.filter(item => {
      const matchesFilter = filter === 'all' || item.type === filter
      const matchesSearch = searchQuery === '' || 
        item.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.preview.toLowerCase().includes(searchQuery.toLowerCase())
      
      return matchesFilter && matchesSearch
    })
  }, [clipboardHistory, filter, searchQuery])

  // Handlers

  const deleteItem = useCallback((id) => {
    setClipboardHistory(prev => {
      const toDel = prev.find(item => item.id === id)
      if (toDel && toDel.type === 'image' && toDel.content && window.electronAPI?.media?.delete) {
        window.electronAPI.media.delete(toDel.content)
      }
      return prev.filter(item => item.id !== id)
    })
  }, [])

  // Simple copyToClipboard
  const copyToClipboard = useCallback(async (content, type) => {
    try {
      if (window.electronAPI && window.electronAPI.clipboard) {
        if (type === 'image') {
          await window.electronAPI.clipboard.setImage(content)
        } else {
          await window.electronAPI.clipboard.setText(content)
        }
      } else {
        if (type === 'image') {
          const response = await fetch(content)
          const blob = await response.blob()
          await navigator.clipboard.write([
            new ClipboardItem({ [blob.type]: blob })
          ])
        } else {
          await navigator.clipboard.writeText(content)
        }
      }
    } catch (error) {
      console.error('❌ Copy operation failed:', error)
      
      if (type !== 'image') {
        try {
          const textArea = document.createElement('textarea')
          textArea.value = content
          document.body.appendChild(textArea)
          textArea.select()
          document.execCommand('copy')
          document.body.removeChild(textArea)
        } catch (fallbackError) {
          console.error('❌ Fallback copy also failed:', fallbackError)
        }
      }
    }
  }, [])

  const handleEdit = useCallback((item) => {
    setEditingitem(item)
  }, [])

  const handleSaveEdit = useCallback((id, newContent) => {
    setClipboardHistory(prev => 
      prev.map(item => 
        item.id === id 
          ? { 
              ...item, 
              content: newContent, 
              preview: newContent.length > 100 ? newContent.substring(0, 100) + '...' : newContent,
              type: detectContentType(newContent)
            }
          : item
      )
    )
    setEditingitem(null)
  }, [detectContentType])

  const handleCancelEdit = useCallback(() => {
    setEditingitem(null)
  }, [])

  const handleOpenSettings = useCallback(() => {
    setShowSettings(true)
  }, [])

  const handleCloseSettings = useCallback(() => {
    setShowSettings(false)
  }, [])

  // Theme Builder handlers
  const handleOpenThemeBuilder = useCallback(() => {
    setShowThemeBuilder(true)
  }, [])

  const handleCloseThemeBuilder = useCallback(() => {
    setShowThemeBuilder(false)
  }, [])

  const handleThemeApply = useCallback(async (themeName) => {
    try {
      console.log(`🎨 Applying theme from ThemeBuilder: ${themeName}`)
      await handleThemeChange(themeName)
      refreshThemes()
    } catch (error) {
      console.error('❌ Failed to apply theme:', error)
    }
  }, [handleThemeChange, refreshThemes])

  const handleClearAllData = useCallback(() => {
    if (window.electronAPI?.media?.clearAll) {
      window.electronAPI.media.clearAll()
    }
    setClipboardHistory([])
    localStorage.removeItem('clipboardHistory')
    lastContentRef.current = ''
    lastTypeRef.current = ''
    updateQueueRef.current = []
  }, [])

  const handleResetSettings = useCallback(async () => {
    try {
      setViewMode('grid')
      setLanguage('en')
      setFilter('all')
      setSearchQuery('')
      setCloseBehavior('minimize')
      setStartMinimized(false)
      setAutoStart(true)
      setShowTrayNotifications(true)
      setQuickAccessHotkey('Ctrl+Shift+X')
      setClearAllHotkey('Ctrl+Shift+Delete')
      setMaxHistoryItems(50)
      
      // Reset theme to dark with proper handling
      console.log('🔄 Resetting theme to dark')
      await handleThemeChange('dark')
    } catch (error) {
      console.error('❌ Failed to reset settings:', error)
    }
  }, [handleThemeChange])

  const categoryCounts = useMemo(() => {
    const counts = { all: clipboardHistory.length, text: 0, image: 0, code: 0 };
    for (const item of clipboardHistory) {
      if (item.type === 'text') counts.text++;
      else if (item.type === 'image') counts.image++;
      else if (item.type === 'code') counts.code++;
    }
    return counts;
  }, [clipboardHistory]);

  return (
    <LanguageProvider initialLanguage={language}>
    <div className="app">
      <TitleBar />
      <Header 
        filter={filter}
        setFilter={setFilter}
        clearHistory={clearHistory}
        totalItems={clipboardHistory.length}
        categoryCounts={categoryCounts}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        viewMode={viewMode}
        setViewMode={setViewMode}
        onOpenSettings={handleOpenSettings}
      />
      <main className="main-content">
        {loading ? (
          <div className="loader-container">
            <div className="loader-circle" />
          </div>
        ) : (
          <ClipboardHistory
            items={filteredHistory}
            onDelete={deleteItem}
            onCopy={copyToClipboard}
            onEdit={handleEdit}
            viewMode={viewMode}
            searchQuery={searchQuery}
          />
        )}
      </main>
      <Footer />
      
      {editingitem && (
        <div className="modal-portal">
          <EditModal
            item={editingitem}
            onSave={handleSaveEdit}
            onCancel={handleCancelEdit}
          />
        </div>
      )}
      
      <SettingsModal
        isOpen={showSettings}
        onClose={handleCloseSettings}
        onClearAllData={handleClearAllData}
        onResetSettings={handleResetSettings}
        onOpenThemeBuilder={handleOpenThemeBuilder}
        onOpenIconCustomizer={() => {}} // Placeholder for future icon customizer
        viewMode={viewMode}
        setViewMode={setViewMode}
        theme={theme}
        setTheme={handleThemeChange}
        availableThemes={availableThemes}
        refreshThemes={refreshThemes}
        language={language}
        setLanguage={setLanguage}
        closeBehavior={closeBehavior}
        setCloseBehavior={setCloseBehavior}
        startMinimized={startMinimized}
        setStartMinimized={setStartMinimized}
        autoStart={autoStart}
        setAutoStart={setAutoStart}
        showTrayNotifications={showTrayNotifications}
        setShowTrayNotifications={setShowTrayNotifications}
        quickAccessHotkey={quickAccessHotkey}
        setQuickAccessHotkey={setQuickAccessHotkey}
        clearAllHotkey={clearAllHotkey}
        setClearAllHotkey={setClearAllHotkey}
        maxHistoryItems={maxHistoryItems}
        setMaxHistoryItems={setMaxHistoryItems}
      />

      <ThemeBuilder
        isOpen={showThemeBuilder}
        onClose={handleCloseThemeBuilder}
        currentTheme={theme}
        onThemeApply={handleThemeApply}
      />
    </div>
    </LanguageProvider>
  )
}

export default App