import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate, useParams, useSearchParams } from "react-router"
import { MergePartyDialog } from "@/components/parties/merge-dialog"
import { PartyRoleBadges } from "@/components/parties/role-badges"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ApiError } from "@/lib/api"
import { askAiHref, deleteParty, erpKeys, getParty } from "@/lib/erp"
import AddressesTab from "./tabs/addresses"
import ContactsTab from "./tabs/contacts"
import PartyKnowledgeTab from "./tabs/knowledge"
import PartyProjectsTab from "./tabs/projects"
import PurchaseOrdersTab from "./tabs/purchase-orders"

const TAB_VALUES = ["contacts", "addresses", "purchase-orders", "projects", "knowledge"] as const
type TabValue = (typeof TAB_VALUES)[number]

const TAB_LABEL: Record<TabValue, string> = {
  contacts: "聯絡人",
  addresses: "地址",
  "purchase-orders": "採購單",
  projects: "專案",
  knowledge: "知識庫",
}

function tabFromParams(params: URLSearchParams): TabValue {
  const raw = params.get("tab")
  return (TAB_VALUES as readonly string[]).includes(raw ?? "") ? (raw as TabValue) : "contacts"
}

function InfoRow({ term, value }: { term: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b py-2 text-sm last:border-b-0">
      <dt className="shrink-0 text-muted-foreground">{term}</dt>
      <dd className="min-w-0 text-right break-words">{value}</dd>
    </div>
  )
}

export default function PartyDetailPage() {
  const { id = "" } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = tabFromParams(searchParams)

  const detailQuery = useQuery({ queryKey: erpKeys.partyDetail(id), queryFn: () => getParty(id), retry: false })

  const deleteMutation = useMutation({
    mutationFn: () => deleteParty(id),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: erpKeys.partyDetail(id) })
      queryClient.invalidateQueries({ queryKey: erpKeys.parties })
      navigate("/parties")
    },
  })

  function setTab(value: string) {
    const next = new URLSearchParams(searchParams)
    if (value === "contacts") next.delete("tab")
    else next.set("tab", value)
    setSearchParams(next, { replace: true })
  }

  if (detailQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (detailQuery.isError) {
    const err = detailQuery.error
    if (err instanceof ApiError && err.status === 404) {
      return (
        <div className="space-y-3">
          <p>找不到這筆往來對象</p>
          <Link to="/parties" className="text-primary underline underline-offset-4">
            回往來對象清單
          </Link>
        </div>
      )
    }
    return (
      <Alert variant="destructive" role="alert">
        <AlertDescription>{err instanceof ApiError ? err.detail : "載入失敗，請稍後再試"}</AlertDescription>
      </Alert>
    )
  }

  const party = detailQuery.data!

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Link to="/parties" className="text-sm text-primary underline-offset-4 hover:underline">
          回往來對象清單
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold">{party.name}</h1>
          <div className="flex flex-wrap items-center gap-2">
            {/* 從別頁導過去才讀得到 ?q=；助手頁只在掛載時讀一次 */}
            <Button asChild variant="outline">
              <Link to={askAiHref(party.name)}>問 AI</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to={`/parties/${party.id}/edit`}>編輯</Link>
            </Button>
            <MergePartyDialog party={party} />
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">刪除往來對象</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>確定刪除這筆往來對象？</AlertDialogTitle>
                  <AlertDialogDescription>
                    刪除後不再進清單，也不再進 AI 的模糊解析；已經開出去的採購單不受影響。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>取消</AlertDialogCancel>
                  <AlertDialogAction onClick={() => deleteMutation.mutate()}>確定</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>

      {deleteMutation.isError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>
            {deleteMutation.error instanceof ApiError ? deleteMutation.error.detail : "刪除失敗，請稍後再試"}
          </AlertDescription>
        </Alert>
      )}

      <section aria-label="往來對象資訊" className="rounded-lg border p-4">
        <dl>
          <InfoRow term="簡稱" value={party.short_name || "—"} />
          <InfoRow term="角色" value={<PartyRoleBadges party={party} />} />
          <InfoRow term="統一編號" value={party.tax_id || "—"} />
          <InfoRow term="產業" value={party.industry || "—"} />
          <InfoRow term="付款條件" value={party.payment_terms || "—"} />
          <InfoRow
            term="別名"
            value={
              party.aliases.length === 0 ? (
                "—"
              ) : (
                <span className="flex flex-wrap justify-end gap-1">
                  {party.aliases.map((a) => (
                    <Badge key={a} variant="outline">
                      {a}
                    </Badge>
                  ))}
                </span>
              )
            }
          />
          <InfoRow term="備註" value={party.notes || "—"} />
        </dl>
      </section>

      <Tabs value={tab} onValueChange={setTab}>
        {/* 窄螢幕讓 TabsList 自己橫向捲動，不要把整頁撐寬。 */}
        <div className="overflow-x-auto">
          <TabsList>
            {TAB_VALUES.map((v) => (
              <TabsTrigger key={v} value={v}>
                {TAB_LABEL[v]}
                {/* 知識條目數用後端給的 knowledge_count，不在前端另外數一次 */}
                {v === "knowledge" && <span className="ml-1 tabular-nums">{party.knowledge_count}</span>}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="contacts">
          <ContactsTab party={party} />
        </TabsContent>
        <TabsContent value="addresses">
          <AddressesTab party={party} />
        </TabsContent>
        <TabsContent value="purchase-orders">
          <PurchaseOrdersTab party={party} />
        </TabsContent>
        <TabsContent value="projects">
          <PartyProjectsTab party={party} />
        </TabsContent>
        <TabsContent value="knowledge">
          <PartyKnowledgeTab party={party} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
