import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ChatStream } from '../copilot/ChatStream'
import { Composer } from '../copilot/Composer'
import { ContextList } from '../copilot/ContextList'
import { DiffList } from '../copilot/DiffList'

describe('copilot shims', () => {
  it('renders hidden anchors', () => {
    render(
      <div>
        <ChatStream />
        <Composer />
        <ContextList />
        <DiffList />
      </div>,
    )
    expect(screen.getByTestId('chat-stream-anchor')).toBeInTheDocument()
    expect(screen.getByTestId('composer-shim')).toBeInTheDocument()
    expect(screen.getByTestId('context-list-shim')).toBeInTheDocument()
    expect(screen.getByTestId('diff-list-shim')).toBeInTheDocument()
  })
})
