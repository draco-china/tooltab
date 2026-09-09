import type { PropsWithChildren } from "react";

export function ToolArticle({
  className = "",
  children,
}: PropsWithChildren<{ className?: string }>) {
  return (
    <article
      className={`min-w-0 text-sm leading-7 wrap-break-word text-foreground/80 sm:text-base [&_a]:font-medium [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-4 [&_blockquote]:mt-6 [&_blockquote]:border-s-2 [&_blockquote]:border-border [&_blockquote]:ps-6 [&_blockquote]:text-foreground/90 [&_blockquote]:italic [&_code]:relative [&_code]:rounded [&_code]:bg-default [&_code]:px-[0.3rem] [&_code]:py-[0.2rem] [&_code]:font-mono [&_code]:text-sm [&_code]:font-normal [&_code]:text-foreground [&_h2]:mt-10 [&_h2]:scroll-m-20 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-balance [&_h2]:text-foreground [&_h2:first-child]:mt-0 [&_h3]:mt-8 [&_h3]:scroll-m-20 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:tracking-tight [&_h3]:text-foreground [&_h4]:mt-6 [&_h4]:scroll-m-20 [&_h4]:text-base [&_h4]:font-semibold [&_h4]:tracking-tight [&_h4]:text-foreground [&_ol]:my-5 [&_ol]:ms-6 [&_ol]:list-decimal [&_ol_li]:mt-2 [&_p:not(:first-child)]:mt-5 [&_pre]:my-6 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-border/70 [&_pre]:bg-default/40 [&_pre]:px-4 [&_pre]:py-3 [&_pre]:text-sm [&_pre]:leading-6 [&_pre_code]:block [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-inherit [&_strong]:font-medium [&_strong]:text-foreground [&_table]:my-6 [&_table]:w-full [&_table]:overflow-hidden [&_table]:rounded-xl [&_table]:border [&_table]:border-border [&_table]:border-separate [&_table]:border-spacing-0 [&_table]:bg-surface [&_td]:border-b [&_td]:border-separator/60 [&_td]:px-4 [&_td]:py-2.5 [&_th]:border-b [&_th]:border-separator [&_th]:bg-surface-secondary [&_th]:px-4 [&_th]:py-2.5 [&_th]:text-start [&_th]:font-medium [&_th]:text-muted [&_ul]:my-5 [&_ul]:ms-6 [&_ul]:list-disc [&_ul]:marker:text-foreground/50 [&_ul_li]:mt-2 ${className}`}
    >
      {children}
    </article>
  );
}
