import { useState } from 'react'
import { FiImage, FiCode, FiType, FiCopy, FiEdit2, FiTrash2, FiCheck } from 'react-icons/fi'
import { useLanguage } from '../utils/i18n'
import '../scss/ClipboardItem.scss'

const ClipboardItem = ({ item, index, onDelete, onCopy, onEdit, viewMode }) => {
  const { t, formatRelativeTime } = useLanguage();
  const [copied, setCopied] = useState(false)

  const formatTimestamp = (timestamp) => {
    return formatRelativeTime(timestamp);
  }

  const getTypeConfig = (type) => {
    switch (type) {
      case 'image': 
        return { 
          icon: FiImage, 
          label: t('item.image')
        }
      case 'code': 
        return { 
          icon: FiCode, 
          label: t('item.code')
        }
      case 'text': 
      default:
        return { 
          icon: FiType, 
          label: t('item.text')
        }
    }
  }

  const handleCopy = async () => {
    try {
      await onCopy(item.content, item.type)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('Copy operation failed:', error)
      setCopied(false)
    }
  }

  const typeConfig = getTypeConfig(item.type)
  const IconComponent = typeConfig.icon

  const renderContent = () => {
    switch (item.type) {
      case 'image':
        return (
          <div className="image-preview">
            <img src={item.preview || item.content} alt="Clipboard content" loading="lazy" />
          </div>
        )
      case 'code':
        return (
          <div className="code-preview">
            <pre><code>{viewMode === 'list' ? item.content : item.preview}</code></pre>
          </div>
        )
      default:
        return (
          <div className="text-preview">
            <p>{viewMode === 'list' ? item.content : item.preview}</p>
          </div>
        )
    }
  }

  return (
    <div 
      className={`clipboard-item ${item.type} ${viewMode}`} 
      data-type={item.type}
    >
      {viewMode === 'grid' && (
        <div className="item-number">
          {String(index + 1).padStart(2, '0')}
        </div>
      )}
      
      <div className="item-header">
        <div className="type-indicator">
          <div className={`type-icon type-icon-${item.type}`}>
            <IconComponent size={14} />
          </div>
          <div className="type-info">
            <span className="type-label">{typeConfig.label}</span>
            <span className="timestamp">{formatTimestamp(item.timestamp)}</span>
          </div>
        </div>
      </div>
      
      <div className="item-content">
        {renderContent()}
      </div>
      
      <div className="item-actions">
        <button 
          className={`action-btn copy-btn ${copied ? 'copied' : ''}`}
          onClick={handleCopy}
          title={t('item.copy')}
          disabled={copied} // ป้องกันการกด copy หลายครั้งติดกัน
        >
          {copied ? <FiCheck size={12} /> : <FiCopy size={12} />}
          {viewMode === 'grid' && (
            <span className="btn-label">{copied ? t('item.copied') : t('item.copy')}</span>
          )}
        </button>
        
        {item.type !== 'image' && (
          <button 
            className="action-btn edit-btn"
            onClick={() => onEdit(item)}
            title={t('item.edit')}
          >
            <FiEdit2 size={12} />
            {viewMode === 'grid' && (
              <span className="btn-label">{t('item.edit')}</span>
            )}
          </button>
        )}
        
        <button 
          className="action-btn delete-btn"
          onClick={() => onDelete(item.id)}
          title={t('item.delete')}
        >
          <FiTrash2 size={12} />
          {viewMode === 'grid' && (
            <span className="btn-label">{t('item.delete')}</span>
          )}
        </button>
      </div>
    </div>
  )
}

export default ClipboardItem