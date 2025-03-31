import type { ResolvedSlidevOptions, SeoMeta } from '@slidev/types'
import type { ResolvableLink } from 'unhead/types'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { slash } from '@antfu/utils'
import { white, yellow } from 'ansis'
import { escapeHtml } from 'markdown-it/lib/common/utils.mjs'
import { createHead, transformHtmlTemplate } from 'unhead/server'
import { version } from '../../package.json'
import { getSlideTitle } from '../commands/shared'
import { toAtFS } from '../resolver'
import { generateCoollabsFontsUrl, generateGoogleFontsUrl } from '../utils'

function toAttrValue(unsafe: unknown) {
  return JSON.stringify(escapeHtml(String(unsafe)))
}

export default async function setupIndexHtml({ mode, entry, clientRoot, userRoot, roots, data, base }: Omit<ResolvedSlidevOptions, 'utils'>): Promise<string> {
  let main = readFileSync(join(clientRoot, 'index.html'), 'utf-8')
  let head = ''
  let body = ''

  for (const root of roots) {
    const path = join(root, 'index.html')
    if (!existsSync(path))
      continue

    const index = readFileSync(path, 'utf-8')

    if (root === userRoot && index.includes('<!DOCTYPE')) {
      console.error(yellow(`[Slidev] Ignored provided index.html with doctype declaration. (${white(path)})`))
      console.error(yellow('This file may be generated by Slidev, please remove it from your project.'))
      continue
    }

    head += `\n${(index.match(/<head>([\s\S]*?)<\/head>/i)?.[1] || '').trim()}`
    body += `\n${(index.match(/<body>([\s\S]*?)<\/body>/i)?.[1] || '').trim()}`
  }

  if (data.features.tweet) {
    body += '\n<script async src="https://platform.twitter.com/widgets.js"></script>'
  }

  const webFontsLink: ResolvableLink[] = []
  if (data.config.fonts.webfonts.length) {
    const { provider } = data.config.fonts
    if (provider === 'google') {
      webFontsLink.push({ rel: 'stylesheet', href: generateGoogleFontsUrl(data.config.fonts), type: 'text/css' })
    }
    else if (provider === 'coollabs') {
      webFontsLink.push({ rel: 'stylesheet', href: generateCoollabsFontsUrl(data.config.fonts), type: 'text/css' })
    }
  }

  const { info, author, keywords } = data.headmatter
  const seoMeta = (data.headmatter.seoMeta ?? {}) as SeoMeta

  const title = getSlideTitle(data)
  const description = info ? toAttrValue(info) : null
  const unhead = createHead({
    init: [
      {
        htmlAttrs: { lang: (data.headmatter.lang as string | undefined) ?? 'en' },
        title,
        link: [
          { rel: 'icon', href: data.config.favicon },
          ...webFontsLink,
        ],
        meta: [
          { property: 'slidev:version', content: version },
          { charset: 'slidev:entry', content: mode === 'dev' && slash(entry) },
          { name: 'description', content: description },
          { name: 'author', content: author ? toAttrValue(author) : null },
          { name: 'keywords', content: keywords ? toAttrValue(Array.isArray(keywords) ? keywords.join(', ') : keywords) : null },
          { property: 'og:title', content: seoMeta.ogTitle || title },
          { property: 'og:description', content: seoMeta.ogDescription || description },
          { property: 'og:image', content: seoMeta.ogImage },
          { property: 'og:url', content: seoMeta.ogUrl },
          { property: 'twitter:card', content: seoMeta.twitterCard },
          { property: 'twitter:site', content: seoMeta.twitterSite },
          { property: 'twitter:title', content: seoMeta.twitterTitle },
          { property: 'twitter:description', content: seoMeta.twitterDescription },
          { property: 'twitter:image', content: seoMeta.twitterImage },
          { property: 'twitter:url', content: seoMeta.twitterUrl },
        ],
      },
    ],
  })

  const baseInDev = mode === 'dev' && base ? base.slice(0, -1) : ''
  main = main
    .replace('__ENTRY__', baseInDev + toAtFS(join(clientRoot, 'main.ts')))
    .replace('<!-- head -->', head)
    .replace('<!-- body -->', body)

  const html = await transformHtmlTemplate(unhead, main)

  return html
}
