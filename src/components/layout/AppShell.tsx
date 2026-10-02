import type { ReactNode } from 'react'
import type { PageId } from '../../router/router'
import { MobileNav } from './MobileNav'
import { PrivacyNotice } from './PrivacyNotice'
import { SaveWarning } from './SaveWarning'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

export function AppShell({ page, children }: { page: PageId; children: ReactNode }) {
  return (
    <div className="app">
      <a className="visually-hidden" href="#contenuto" onClick={(e) => {
        e.preventDefault()
        document.getElementById('contenuto')?.focus()
      }}>
        Vai al contenuto
      </a>
      <Sidebar page={page} />
      <div className="main-area">
        <Topbar />
        <main id="contenuto" tabIndex={-1} style={{ outline: 'none' }}>
          <div className="notices">
            <SaveWarning />
            <PrivacyNotice />
          </div>
          {children}
        </main>
      </div>
      <MobileNav page={page} />
    </div>
  )
}
