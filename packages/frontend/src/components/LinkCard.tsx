import React from 'react'
import type { CustomLink } from '../api/links'

interface LinkCardProps {
  link: CustomLink
}

const LinkCard: React.FC<LinkCardProps> = ({ link }) => {
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
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-white font-bold text-sm"
          style={{ backgroundColor: link.icon_color }}
        >
          {link.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-bold text-lg truncate">{link.name}</h3>
          <p className="text-slate-500 text-xs truncate">{hostname}</p>
        </div>
        <span className="flex items-center gap-1.5 text-xs font-medium shrink-0 text-blue-400">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
          自訂
        </span>
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
