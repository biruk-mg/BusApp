'use client'

import StaffShell from '@/components/StaffShell'

export default function CheckerPage() {
  return (
    <StaffShell allowed={['CHECKER', 'MANAGER', 'ADMIN']} title="Ticket check-in">
      <div style={{ background: 'white', border: '1px solid #EEEEEE', borderRadius: '16px', padding: '24px' }}>
        <p style={{ fontSize: '15px', color: '#1a1a1a', fontWeight: 600, marginBottom: '8px' }}>
          Your account is ready.
        </p>
        <p style={{ fontSize: '14px', color: '#666', lineHeight: 1.6 }}>
          The passenger list and QR ticket scanning for boarding are the next features we are building.
          They will appear on this page.
        </p>
      </div>
    </StaffShell>
  )
}
