import { useStore } from '@/store/useStore'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SHORTCUT_GROUPS } from '@/shortcuts'

export function HelpOverlay(): JSX.Element {
  const open = useStore((s) => s.helpOpen)
  const close = useStore((s) => s.closeHelp)

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? null : close())}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>키보드 단축키</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {group.title}
              </h3>
              <ul className="space-y-1.5">
                {group.items.map((item) => (
                  <li key={item.keys} className="flex items-center justify-between gap-4 text-sm">
                    <span className="text-muted-foreground">{item.desc}</span>
                    <kbd className="shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 text-xs text-foreground">
                      {item.keys}
                    </kbd>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
