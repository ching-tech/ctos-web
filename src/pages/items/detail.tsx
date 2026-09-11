import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate, useParams, useSearchParams } from "react-router"
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
import { deleteItem, erpKeys, formatAmount, formatLeadDays, getItem, itemAskAiHref } from "@/lib/erp"
import ItemMovementsTab from "./tabs/movements"
import ItemStockTab from "./tabs/stock"

const TAB_VALUES = ["stock", "movements"] as const
type TabValue = (typeof TAB_VALUES)[number]

const TAB_LABEL: Record<TabValue, string> = {
  stock: "庫存",
  movements: "異動",
}

function tabFromParams(params: URLSearchParams): TabValue {
  const raw = params.get("tab")
  return (TAB_VALUES as readonly string[]).includes(raw ?? "") ? (raw as TabValue) : "stock"
}

function InfoRow({ term, value }: { term: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b py-2 text-sm last:border-b-0">
      <dt className="shrink-0 text-muted-foreground">{term}</dt>
      <dd className="min-w-0 text-right break-words">{value}</dd>
    </div>
  )
}

export default function ItemDetailPage() {
  const { id = "" } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = tabFromParams(searchParams)

  const detailQuery = useQuery({ queryKey: erpKeys.itemDetail(id), queryFn: () => getItem(id), retry: false })

  const deleteMutation = useMutation({
    mutationFn: () => deleteItem(id),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: erpKeys.itemDetail(id) })
      queryClient.invalidateQueries({ queryKey: erpKeys.items })
      navigate("/items")
    },
  })

  function setTab(value: string) {
    const next = new URLSearchParams(searchParams)
    if (value === "stock") next.delete("tab")
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
          <p>找不到這筆物料</p>
          <Link to="/items" className="text-primary underline underline-offset-4">
            回物料清單
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

  const item = detailQuery.data!

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Link to="/items" className="text-sm text-primary underline-offset-4 hover:underline">
          回物料清單
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* 料號與品名一起當標題：物料在對話裡通常兩個一起講 */}
          <h1 className="text-2xl font-semibold">
            <span className="font-mono text-muted-foreground">{item.code}</span> {item.name}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            {/* 從別頁導過去才讀得到 ?q=；助手頁只在掛載時讀一次 */}
            <Button asChild variant="outline">
              <Link to={itemAskAiHref(item.code, item.name)}>問 AI</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to={`/items/${item.id}/edit`}>編輯</Link>
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">刪除物料</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>確定刪除這筆物料？</AlertDialogTitle>
                  <AlertDialogDescription>
                    刪除後不再進清單，也不再進 AI 的模糊解析；已經寫下的庫存異動紀錄照樣留著。
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

      <section aria-label="物料資訊" className="rounded-lg border p-4">
        <dl>
          <InfoRow term="規格" value={item.spec || "—"} />
          <InfoRow term="單位" value={item.unit || "—"} />
          <InfoRow term="分類" value={item.item_group || "—"} />
          <InfoRow
            term="預設供應商"
            value={
              item.default_supplier_id && item.default_supplier_name ? (
                <Link
                  to={`/parties/${item.default_supplier_id}`}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  {item.default_supplier_name}
                </Link>
              ) : (
                "—"
              )
            }
          />
          <InfoRow term="採購價" value={<span className="tabular-nums">{formatAmount(item.purchase_price)}</span>} />
          <InfoRow term="交期" value={formatLeadDays(item.lead_days)} />
          <InfoRow
            term="別名"
            value={
              item.aliases.length === 0 ? (
                "—"
              ) : (
                <span className="flex flex-wrap justify-end gap-1">
                  {item.aliases.map((a) => (
                    <Badge key={a} variant="outline">
                      {a}
                    </Badge>
                  ))}
                </span>
              )
            }
          />
          <InfoRow term="備註" value={item.notes || "—"} />
        </dl>
      </section>

      <Tabs value={tab} onValueChange={setTab}>
        {/* 窄螢幕讓 TabsList 自己橫向捲動，不要把整頁撐寬。 */}
        <div className="overflow-x-auto">
          <TabsList>
            {TAB_VALUES.map((v) => (
              <TabsTrigger key={v} value={v}>
                {TAB_LABEL[v]}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="stock">
          <ItemStockTab item={item} />
        </TabsContent>
        <TabsContent value="movements">
          <ItemMovementsTab item={item} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
