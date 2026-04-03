import React from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Service } from '../api/services'
import { pinService, unpinService } from '../api/services'

interface ServiceCardProps {
  service: Service
}

const ServiceCard: React.FC<ServiceCardProps> = ({ service }) => {
  const queryClient = useQueryClient()
  const description =
    service.custom_description || service.ai_description || '暫無描述'

  const pinMutation = useMutation({
    mutationFn: () =>
      service.is_pinned ? unpinService(service.id) : pinService(service.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] })
    },
  })

  const handleOpen = () => {
    if (service.domain) {
      window.open(`https://${service.domain}`, '_blank')
    }
  }

  return (
    <div className={`bg-slate-800 rounded-xl p-4 flex flex-col gap-3 border transition ${
      service.status === 'offline'
        ? 'border-slate-700/50 opacity-60'
        : 'border-slate-700 hover:border-slate-500'
    }`}>
      {/* Header: pin star, name, status */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <button
            type="button"
            onClick={() => pinMutation.mutate()}
            disabled={pinMutation.isPending}
            className="shrink-0 transition disabled:opacity-50"
            aria-label={service.is_pinned ? '取消置頂' : '置頂'}
            title={service.is_pinned ? '取消置頂' : '置頂'}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill={service.is_pinned ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={
                service.is_pinned
                  ? 'text-yellow-400'
                  : 'text-slate-500 hover:text-yellow-400'
              }
            >
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </button>
          <h3 className="text-white font-bold text-lg truncate">
            {service.display_name || service.name}
          </h3>
        </div>
        <span
          className={`flex items-center gap-1.5 text-xs font-medium shrink-0 ${
            service.status === 'online' ? 'text-green-400' : 'text-red-400'
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              service.status === 'online' ? 'bg-green-400' : 'bg-red-400'
            }`}
          />
          {service.status === 'offline' && 'offline'}
        </span>
      </div>

      {/* Domain URL */}
      {service.domain && (
        <a
          href={`https://${service.domain}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-400 hover:text-blue-300 text-sm truncate transition"
        >
          {service.domain}
        </a>
      )}

      {/* Description */}
      <p className="text-slate-400 text-sm line-clamp-2 flex-1">
        {description}
      </p>

      {/* Open button */}
      <button
        type="button"
        onClick={handleOpen}
        disabled={!service.domain}
        className="mt-auto w-full py-2 rounded-lg text-sm font-medium transition disabled:opacity-40 disabled:cursor-not-allowed bg-blue-600 hover:bg-blue-500 text-white"
      >
        開啟
      </button>
    </div>
  )
}

export default ServiceCard
