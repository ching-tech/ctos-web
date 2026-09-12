import { useQuery } from "@tanstack/react-query"
import * as React from "react"
import { Link, useParams } from "react-router"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { ApiError } from "@/lib/api"
import { deviceTypeLabel, geoLabel, getLoginRecord, loginRecordKeys } from "@/lib/login-records"

function Row({ term, value }: { term: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b py-2 text-sm last:border-b-0">
      <dt className="shrink-0 text-muted-foreground">{term}</dt>
      <dd className="min-w-0 text-right break-words">{value}</dd>
    </div>
  )
}

function NotFound() {
  return (
    <div className="space-y-3">
      <p>找不到這筆登入紀錄</p>
      <Link to="/login-records" className="text-primary underline underline-offset-4">
        回清單
      </Link>
    </div>
  )
}

export default function LoginRecordDetailPage() {
  const { id = "" } = useParams()
  const recordId = Number(id)
  const valid = Number.isInteger(recordId) && recordId > 0

  const detailQuery = useQuery({
    queryKey: loginRecordKeys.detail(recordId),
    queryFn: () => getLoginRecord(recordId),
    retry: false,
    enabled: valid,
  })

  if (!valid) return <NotFound />

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
    // 非管理員拿別人的紀錄後端一律回 404，不洩漏存在（api/login_records.py 127–131）。
    if (err instanceof ApiError && err.status === 404) return <NotFound />
    return <p className="text-destructive">{err instanceof ApiError ? err.detail : "載入失敗，請稍後再試"}</p>
  }

  if (!detailQuery.data) return null
  const r = detailQuery.data
  const hasGeoPoint = r.geo_latitude !== null && r.geo_longitude !== null

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Link to="/login-records" className="text-sm text-primary underline-offset-4 hover:underline">
          回清單
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">{new Date(r.created_at).toLocaleString("zh-TW")}</h1>
          <Badge variant={r.success ? "tint" : "destructive"}>{r.success ? "成功" : "失敗"}</Badge>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">登入</CardTitle>
        </CardHeader>
        <CardContent>
          <dl>
            <Row term="使用者" value={r.username} />
            <Row term="使用者 ID" value={r.user_id ?? "—"} />
            <Row term="結果" value={r.success ? "成功" : "失敗"} />
            <Row
              term="失敗原因"
              value={r.failure_reason ? <span className="text-destructive">{r.failure_reason}</span> : "—"}
            />
            <Row term="Session ID" value={r.session_id || "—"} />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">來源</CardTitle>
        </CardHeader>
        <CardContent>
          <dl>
            <Row term="IP 位址" value={r.ip_address} />
            <Row term="地點" value={geoLabel(r)} />
            {/* 經緯度是 Decimal，pydantic 送字串；兩個都有值才顯示。 */}
            {hasGeoPoint && <Row term="經緯度" value={`${r.geo_latitude}, ${r.geo_longitude}`} />}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">裝置</CardTitle>
        </CardHeader>
        <CardContent>
          <dl>
            <Row term="裝置類型" value={deviceTypeLabel(r.device_type)} />
            <Row term="瀏覽器" value={r.browser || "—"} />
            <Row term="作業系統" value={r.os || "—"} />
            <Row term="裝置指紋" value={r.device_fingerprint || "—"} />
            <Row
              term="User Agent"
              value={r.user_agent ? <span className="font-mono text-xs">{r.user_agent}</span> : "—"}
            />
          </dl>
        </CardContent>
      </Card>
    </div>
  )
}
