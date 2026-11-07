'use client'

import StaffShell from '@/components/StaffShell'

export default function CounterPage() {
  return (
    <StaffShell allowed={['SELLER', 'MANAGER', 'ADMIN']} title="Counter sales">
      <div style={{ background: 'white', border: '1px solid #EEEEEE', borderRadius: '16px', padding: '24px' }}>
        <p style={{ fontSize: '15px', color: '#1a1a1a', fontWeight: 600, marginBottom: '8px' }}>
          Your account is ready.
        </p>
        <p style={{ fontSize: '14px', color: '#666', lineHeight: 1.6 }}>
          Selling tickets at the counter (cash and digital) is the next feature we are building.
          It will appear on this page.
        </p>
      </div>
    </StaffShell>
  )
}
