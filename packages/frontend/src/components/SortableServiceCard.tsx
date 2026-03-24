import React from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import ServiceCard from './ServiceCard'
import type { Service } from '../api/services'

interface SortableServiceCardProps {
  service: Service
  isEditing: boolean
}

const SortableServiceCard: React.FC<SortableServiceCardProps> = ({
  service,
  isEditing,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: service.id, disabled: !isEditing })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <ServiceCard
        service={service}
        isEditing={isEditing}
        dragListeners={listeners}
        isDragging={isDragging}
      />
    </div>
  )
}

export default SortableServiceCard
