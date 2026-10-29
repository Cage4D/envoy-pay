import { useCallback } from 'react'
import { useAccount } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { Vault } from 'lucide-react'
import { appConfig } from './config'
import { Actions } from './components/Actions'
import { Connect } from './components/Connect'
import { Feed } from './components/Feed'
import { Summary } from './components/Summary'
import { useVaultLogs, usePayees } from './hooks/useVaultLogs'
import { useVaultState } from './hooks/useVaultState'

export default function App() {
  const { address } = useAccount()
  const queryClient = useQueryClient()
  const vault = useVaultState(address)
  const logs = useVaultLogs()
  const payees = usePayees(logs.candidates)

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['vault-state'] })
    void queryClient.invalidateQueries({ queryKey: ['payees'] })
  }, [queryClient])

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            <Vault size={18} />
          </span>
          <div>
            <h1>Envoy Vault</h1>
            <p className="muted small">Owner dashboard · {appConfig.chainName}</p>
          </div>
        </div>
        <Connect />
      </header>

      <main className="layout">
        <div className="col col-sticky">
          <Summary state={vault.data} loading={vault.isLoading} error={vault.isError} payees={payees.data ?? []} />
        </div>
        <div className="col">
          <Actions state={vault.data} onChanged={refresh} />
          <Feed events={logs.events} progress={logs.progress} error={logs.error} />
        </div>
      </main>
    </div>
  )
}
