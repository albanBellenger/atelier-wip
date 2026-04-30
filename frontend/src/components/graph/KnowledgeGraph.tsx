import ForceGraph2D from 'react-force-graph-2d'
import { useMemo, useState } from 'react'
import type { ReactElement } from 'react'

export interface GraphNode {
  id: string
  entity_type: string
  entity_id: string
  label: string
  stale?: boolean | null
  status?: string | null
}

export interface GraphEdge {
  source: string
  target: string
  edge_type: string
}

export interface KnowledgeGraphProps {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

const COLORS: Record<string, string> = {
  section: '#60a5fa',
  work_order: '#fb923c',
  artifact: '#4ade80',
  issue: '#f87171',
}

export function KnowledgeGraph(props: KnowledgeGraphProps): ReactElement {
  const [showSection, setShowSection] = useState(true)
  const [showWo, setShowWo] = useState(true)
  const [showArtifact, setShowArtifact] = useState(true)
  const [showIssue, setShowIssue] = useState(true)
  const [staleOnly, setStaleOnly] = useState(false)

  const graphData = useMemo(() => {
    const nodes = props.nodes.filter((n) => {
      if (n.entity_type === 'section' && !showSection) return false
      if (n.entity_type === 'work_order' && !showWo) return false
      if (n.entity_type === 'artifact' && !showArtifact) return false
      if (n.entity_type === 'issue' && !showIssue) return false
      if (staleOnly && n.entity_type === 'work_order' && !n.stale) return false
      return true
    })
    const idSet = new Set(nodes.map((n) => n.id))
    const links = props.edges
      .filter((e) => idSet.has(e.source) && idSet.has(e.target))
      .map((e) => ({
        source: e.source,
        target: e.target,
      }))
    return { nodes, links }
  }, [
    props.nodes,
    props.edges,
    showSection,
    showWo,
    showArtifact,
    showIssue,
    staleOnly,
  ])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-4 text-xs text-zinc-400">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={showSection}
            onChange={(e) => setShowSection(e.target.checked)}
          />
          Sections
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={showWo}
            onChange={(e) => setShowWo(e.target.checked)}
          />
          Work orders
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={showArtifact}
            onChange={(e) => setShowArtifact(e.target.checked)}
          />
          Artifacts
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={showIssue}
            onChange={(e) => setShowIssue(e.target.checked)}
          />
          Issues
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={staleOnly}
            onChange={(e) => setStaleOnly(e.target.checked)}
          />
          Stale WO only
        </label>
      </div>
      <div
        className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950"
        style={{ height: 480 }}
      >
        {graphData.nodes.length === 0 ? (
          <p className="p-8 text-center text-sm text-zinc-500">
            No nodes match the current filters.
          </p>
        ) : (
          <ForceGraph2D
            graphData={graphData}
            nodeLabel="label"
            nodeCanvasObject={(node, ctx, globalScale) => {
              const n = node as GraphNode & { x?: number; y?: number }
              const label = n.label || ''
              const fontSize = 12 / globalScale
              ctx.font = `${fontSize}px Sans`
              const r =
                n.entity_type === 'work_order'
                  ? 7
                  : n.entity_type === 'section'
                    ? 6
                    : 5
              ctx.beginPath()
              ctx.arc(n.x!, n.y!, r, 0, 2 * Math.PI, false)
              ctx.fillStyle = COLORS[n.entity_type] ?? '#a1a1aa'
              ctx.fill()
              if (n.entity_type === 'work_order' && n.stale) {
                ctx.strokeStyle = '#fcd34d'
                ctx.lineWidth = 2 / globalScale
                ctx.stroke()
              }
              ctx.fillStyle = '#e4e4e7'
              ctx.textAlign = 'center'
              ctx.textBaseline = 'top'
              const lines = label.length > 42 ? `${label.slice(0, 40)}…` : label
              ctx.fillText(lines, n.x!, n.y! + r + 2)
            }}
            cooldownTicks={120}
          />
        )}
      </div>
      <p className="text-xs text-zinc-500">
        Blue = section, orange = work order, green = artifact, red = issue. Gold ring =
        potentially stale work order.
      </p>
    </div>
  )
}
