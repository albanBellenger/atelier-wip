import type { ReactElement } from 'react'
import { useState } from 'react'
import {
  ADMIN_CONSOLE_ACCENT,
  Btn,
  Card,
  Dot,
  Field,
  FieldSelect,
  PageTitle,
  Pill,
  ProviderGlyph,
  Toggle,
} from '../../components/admin/adminPrimitives'
import { DEPLOYMENT_PROVIDERS, PROVIDER_BY_STUDIO_INIT, STUDIOS } from '../../data/adminConsoleMock'

export function StudiosSection(): ReactElement {
  const [selected, setSelected] = useState(STUDIOS[0]?.id ?? '')
  const studio = STUDIOS.find((s) => s.id === selected)

  if (!studio) {
    return (
      <div className="text-sm text-zinc-400">
        No studios in demo data.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageTitle
        title="Studios"
        subtitle="Create and configure studios. Connect GitLab for publishing; LLM access is managed in LLM connectivity."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
        <Card
          title="All studios"
          right={
            <Btn type="button" tone="primary" style={{ background: ADMIN_CONSOLE_ACCENT }}>
              + New
            </Btn>
          }
        >
          <ul>
            {STUDIOS.map((s, i) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setSelected(s.id)}
                  className={`flex w-full items-center justify-between border-zinc-800/60 px-4 py-3 text-left transition ${i > 0 ? 'border-t' : ''} ${selected === s.id ? 'bg-zinc-900/60' : 'hover:bg-zinc-900/40'}`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded border border-zinc-800 bg-zinc-950 font-mono text-[10px] text-zinc-300">
                        {s.name
                          .split(' ')
                          .map((w) => w[0])
                          .slice(0, 2)
                          .join('')}
                      </span>
                      <span className="truncate text-[13px] text-zinc-100">{s.name}</span>
                    </div>
                    <div className="mt-1 text-[11px] text-zinc-500">
                      {s.software} software · {s.members} members
                    </div>
                  </div>
                  {selected === s.id ? (
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: ADMIN_CONSOLE_ACCENT }}
                    />
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <div className="space-y-6">
          <Card title={studio.name}>
            <div className="grid grid-cols-1 gap-x-6 gap-y-4 p-5 sm:grid-cols-2">
              <Field label="Display name" value={studio.name} />
              <Field label="Slug" value={studio.id} mono />
              <Field label="Created" value={studio.created} readOnly />
              <Field label="Members" value={`${studio.members} active`} readOnly />
            </div>
          </Card>

          <Card
            title="GitLab connectivity"
            right={
              <Pill tone={studio.id !== 's_helio' ? 'emerald' : 'amber'}>
                <Dot tone={studio.id !== 's_helio' ? 'emerald' : 'amber'} />
                {studio.id !== 's_helio' ? 'connected' : 'not connected'}
              </Pill>
            }
          >
            <div className="grid grid-cols-1 gap-x-6 gap-y-4 p-5 sm:grid-cols-2">
              <Field
                label="Host"
                value={studio.id === 's_kraft' ? 'gitlab.kraftwerk.io' : 'gitlab.northwind.dev'}
                mono
              />
              <Field
                label="Group"
                value={studio.id === 's_kraft' ? 'kraftwerk/voice' : 'northwind/portal'}
                mono
              />
              <Field label="Default branch" value="main" mono />
              <Field label="Auth" value="OAuth + deploy key" readOnly />
              <Field label="Token" value="glpat-…b09e" mono />
              <FieldSelect
                label="Publish strategy"
                value="Pull Request"
                options={['Pull Request', 'Direct push', 'Manual export']}
              />
            </div>
            <div className="flex items-center justify-between border-t border-zinc-800/60 px-5 py-3">
              <span className="text-[11px] text-zinc-500">
                Last published 4h ago · commit{' '}
                <span className="font-mono text-zinc-300">a3f1c8e</span>
              </span>
              <div className="flex gap-2">
                <Btn type="button">Test connection</Btn>
                <Btn type="button">Rotate token</Btn>
              </div>
            </div>
          </Card>

          <Card title="Allowed providers (this studio)">
            <ul>
              {DEPLOYMENT_PROVIDERS.map((p, i) => (
                <li
                  key={p.id}
                  className={`flex items-center justify-between px-5 py-3 ${i > 0 ? 'border-t border-zinc-800/60' : ''}`}
                >
                  <div className="flex items-center gap-3">
                    <ProviderGlyph name={p.name} />
                    <div>
                      <div className="text-[13px] text-zinc-100">{p.name}</div>
                      <div className="text-[11px] text-zinc-500">
                        {p.region} · {p.models.length} model{p.models.length === 1 ? '' : 's'}
                      </div>
                    </div>
                  </div>
                  <Toggle
                    checked={Boolean(PROVIDER_BY_STUDIO_INIT[selected]?.[p.id])}
                    onChange={() => {}}
                    disabled={p.status !== 'connected'}
                  />
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  )
}
