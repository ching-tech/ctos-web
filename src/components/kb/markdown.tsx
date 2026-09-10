import * as React from "react"
import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import { rewriteImageSrc } from "@/lib/kb"

// 內文的 `#` 標題整體降一階，避免和頁面自己的 <h1> 標題撞名／撞語意。
const HEADING_TAGS = ["h2", "h3", "h4", "h5", "h6", "h6"] as const

function headingComponent(level: 1 | 2 | 3 | 4 | 5 | 6) {
  const Tag = HEADING_TAGS[level - 1]
  return function Heading(props: React.ComponentPropsWithoutRef<typeof Tag>) {
    return <Tag {...props} />
  }
}

function isExternalHref(href?: string): boolean {
  return !!href && /^https?:\/\//.test(href)
}

const components: Components = {
  img: ({ src, alt }) => <img src={rewriteImageSrc(typeof src === "string" ? src : "")} alt={alt ?? ""} className="max-w-full rounded" />,
  a: ({ href, children, ...props }) => {
    const external = isExternalHref(href)
    return (
      <a href={href} {...props} {...(external ? { target: "_blank", rel: "noreferrer" } : {})}>
        {children}
      </a>
    )
  },
  h1: headingComponent(1),
  h2: headingComponent(2),
  h3: headingComponent(3),
  h4: headingComponent(4),
  h5: headingComponent(5),
  h6: headingComponent(6),
}

export function Markdown({ content }: { content: string }) {
  return (
    <div className="md max-w-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  )
}
