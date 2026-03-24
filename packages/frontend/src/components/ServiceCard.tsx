import React from 'react'
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities'
import type { Service } from '../api/services'

interface ServiceCardProps {
  service: Service
  isEditing?: boolean
  dragListeners?: SyntheticListenerMap
  isDragging?: boolean
}

const ServiceCard: React.FC<ServiceCardProps> = ({
  service,
  isEditing = false,
  dragListeners,
  isDragging = false,
}) => {
  const description =
    service.custom_description || service.ai_description || '暫無描述'
  const firstPublicPort = service.ports.find((p) => p.public)?.public
  const openPort = service.preferred_port ?? firstPublicPort

  const handleOpen = () => {
    if (isEditing) return
    if (openPort) {
      window.open(
        `http://${window.location.hostname}:${openPort}`,
        '_blank'
      )
    }
  }

  return (
    <div
      className={`bg-slate-800 rounded-xl p-4 flex flex-col gap-3 transition ${
        isEditing
          ? 'border-2 border-dashed border-blue-400'
          : 'border border-slate-700 hover:border-slate-500'
      } ${isDragging ? 'shadow-2xl shadow-blue-500/20' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        {isEditing && (
          <button
            type="button"
            className="text-slate-400 hover:text-white cursor-grab active:cursor-grabbing mt-0.5 shrink-0"
            {...dragListeners}
            aria-label="拖拉排序"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <circle cx="9" cy="5" r="1.5" />
              <circle cx="15" cy="5" r="1.5" />
              <circle cx="9" cy="10" r="1.5" />
              <circle cx="15" cy="10" r="1.5" />
              <circle cx="9" cy="15" r="1.5" />
              <circle cx="15" cy="15" r="1.5" />
              <circle cx="9" cy="20" r="1.5" />
              <circle cx="15" cy="20" r="1.5" />
            </svg>
          </button>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-bold text-lg truncate">
            {service.display_name || service.name}
          </h3>
          {service.display_name && (
            <p className="text-slate-500 text-xs truncate">{service.name}</p>
          )}
        </div>
        <span
          className={`flex items-center gap-1.5 text-xs font-medium shrink-0 ${
            service.status === 'online' ? 'text-green-400' : 'text-slate-500'
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              service.status === 'online' ? 'bg-green-400' : 'bg-slate-500'
            }`}
          />
          {service.status === 'online' ? '線上' : '離線'}
        </span>
      </div>

      <p className="text-slate-400 text-sm line-clamp-2 flex-1">
        {description}
      </p>

      {service.ports.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {service.ports.map((port, idx) => (
            <span
              key={idx}
              className="text-xs bg-slate-700 text-slate-300 rounded px-2 py-0.5"
            >
              {port.public}:{port.private}/{port.type}
            </span>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={handleOpen}
        disabled={isEditing || !openPort || service.status === 'offline'}
        className="mt-auto w-full py-2 rounded-lg text-sm font-medium transition disabled:opacity-40 disabled:cursor-not-allowed bg-blue-600 hover:bg-blue-500 text-white"
      >
        {isEditing ? '編輯模式' : '開啟'}
      </button>
    </div>
  )
}

export default ServiceCard
