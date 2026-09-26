import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'

interface MarkdownViewProps {
  source: string
  className?: string
  /** When provided, GFM task checkboxes become interactive (line is 1-based). */
  onToggleTask?: (line: number, checked: boolean) => void
  /**
   * Take over link clicks (e.g. relative links between project docs). Without it,
   * a plain <a> would navigate the whole app window away.
   */
  onLinkClick?: (href: string) => void
}

export function MarkdownView({ source, className, onToggleTask, onLinkClick }: MarkdownViewProps): JSX.Element {
  const linkComponents: Components = onLinkClick
    ? {
        a({ href, children }) {
          return (
            <a
              href={href}
              onClick={(e) => {
                e.preventDefault()
                if (href) onLinkClick(href)
              }}
            >
              {children}
            </a>
          )
        }
      }
    : {}
  const components: Components | undefined = onToggleTask
    ? {
        ...linkComponents,
        input(props) {
          // Only GFM task-list checkboxes; make them clickable and map back to source.
          if (props.type === 'checkbox') {
            const line = (props as { node?: { position?: { start?: { line?: number } } } }).node
              ?.position?.start?.line
            return (
              <input
                type="checkbox"
                checked={Boolean(props.checked)}
                disabled={line == null}
                onChange={() => line != null && onToggleTask(line, !props.checked)}
                className="cursor-pointer"
              />
            )
          }
          return <input {...props} />
        }
      }
    : onLinkClick
      ? linkComponents
      : undefined

  return (
    <div
      className={cn(
        'prose prose-sm max-w-none dark:prose-invert prose-headings:font-semibold prose-pre:bg-muted prose-pre:text-foreground prose-code:before:content-none prose-code:after:content-none',
        className
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {source && source.trim() ? source : '_내용 없음_'}
      </ReactMarkdown>
    </div>
  )
}
