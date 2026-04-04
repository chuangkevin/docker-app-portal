import React from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { pinLink, unpinLink } from '../api/links'
import type { CustomLink } from '../api/links'

interface LinkCardProps {
  link: CustomLink
}

const LinkCard: React.FC<LinkCardProps> = ({ link }) => {
  const queryClient = useQueryClient()

  const pinMutation = useMutation({
    mutationFn: () =>
      link.is_pinned ? unpinLink(link.id) : pinLink(link.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['links'] })
    },
  })

  const handleOpen = () => {
    window.open(link.url, '_blank')
  }

  // Extract hostname for display
  let hostname = ''
  try {
    hostname = new URL(link.url).hostname
  } catch {
    hostname = link.url
  }

  return (
    <div className="bg-slate-800 rounded-xl p-4 flex flex-col gap-3 border border-slate-700 hover:border-slate-500 transition">
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={() => pinMutation.mutate()}
          disabled={pinMutation.isPending}
          className="mt-0.5 shrink-0 transition"
          title={link.is_pinned ? '取消置頂' : '置頂'}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill={link.is_pinned ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={link.is_pinned ? 'text-yellow-400' : 'text-slate-500 hover:text-yellow-400'}
          >
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-bold text-lg truncate">{link.name}</h3>
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 text-sm truncate block transition"
          >
            {hostname}
          </a>
        </div>
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-white font-bold text-sm"
          style={{ backgroundColor: link.icon_color }}
        >
          {link.name.charAt(0).toUpperCase()}
        </div>
      </div>

      <p className="text-slate-400 text-sm line-clamp-2 flex-1">
        {link.description || '自訂連結'}
      </p>

      <button
        type="button"
        onClick={handleOpen}
        className="mt-auto w-full py-2 rounded-lg text-sm font-medium transition bg-blue-600 hover:bg-blue-500 text-white"
      >
        開啟
      </button>
    </div>
  )
}

export default LinkCard
