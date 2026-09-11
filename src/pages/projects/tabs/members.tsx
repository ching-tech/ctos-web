import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ApiError } from "@/lib/api"
import {
  addMember,
  MEMBER_ROLE_LABEL,
  memberName,
  projectKeys,
  projectLabel,
  removeMember,
  type ProjectDetail,
} from "@/lib/projects"
import { listSimpleUsers, simpleUserName, userKeys } from "@/lib/users"

export default function MembersTab({ project, canEdit }: { project: ProjectDetail; canEdit: boolean }) {
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: projectKeys.detail(project.id) })

  const usersQuery = useQuery({ queryKey: userKeys.list, queryFn: listSimpleUsers, enabled: canEdit })
  const candidates = (usersQuery.data?.users ?? []).filter(
    (u) => !project.members.some((m) => m.user_id === u.id),
  )

  const addMutation = useMutation({
    mutationFn: (userId: number) => addMember(project.id, userId),
    onSuccess: invalidate,
  })
  const removeMutation = useMutation({
    mutationFn: (userId: number) => removeMember(project.id, userId),
    onSuccess: invalidate,
  })

  const error = addMutation.error ?? removeMutation.error

  return (
    <div className="space-y-4 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">共 {project.members.length} 位成員</p>
        {canEdit && (
          <Select value="" onValueChange={(v) => addMutation.mutate(Number(v))}>
            <SelectTrigger className="w-40" aria-label="加入成員">
              <SelectValue placeholder="加入成員" />
            </SelectTrigger>
            <SelectContent>
              {candidates.map((u) => (
                <SelectItem key={u.id} value={String(u.id)}>
                  {simpleUserName(u)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error instanceof ApiError ? error.detail : "操作失敗，請稍後再試"}</AlertDescription>
        </Alert>
      )}

      {project.members.length === 0 ? (
        <p className="text-muted-foreground">還沒有成員</p>
      ) : (
        <ul className="space-y-2">
          {project.members.map((m) => (
            <li key={m.user_id} className="flex items-center justify-between gap-2 rounded-lg border p-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium">{memberName(m)}</span>
                <Badge variant="tint">{projectLabel(MEMBER_ROLE_LABEL, m.role)}</Badge>
              </div>
              {canEdit && m.role !== "owner" && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={removeMutation.isPending}
                  onClick={() => removeMutation.mutate(m.user_id)}
                >
                  移除
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
