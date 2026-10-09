export type Image = {
  publicId: string
  width: number
  height: number
  altText: string | null
}

export type ImageInput = Image & { format: string; bytes: number }

export type FeedItem = {
  id: number
  slug: string
  title: string
  excerpt: string
  publishedAt: string
  images: Image[]
  commentCount?: number
}

export type Profile = { displayName: string; bio: string | null; postCount: number }

export type FeedPage = { items: FeedItem[]; nextCursor: string | null }

export type FeedQuery = { cursor?: string | null; q?: string; from?: string; to?: string }

export type PostStatus = 'Draft' | 'Published'

export type PostDetail = {
  id: number
  slug: string | null
  title: string
  body: string
  publishedAt: string | null
  updatedAt: string
  author: { displayName: string }
  images: (ImageInput & { position: number })[]
  status?: PostStatus
  newer?: PostLink | null
  older?: PostLink | null
  commentCount?: number
}

export type Comment = { id: number; name: string; body: string; isAuthor: boolean; createdAt: string }

export type CommentInput = { name: string; body: string; website: string }

export type CommentPage<T = Comment> = { items: T[]; hasMore: boolean }

export type AdminComment = Comment & {
  post: { id: number; slug: string | null; title: string; status: PostStatus; coverPublicId: string | null }
}

export type AdminCommentPage = CommentPage<AdminComment> & { total: number; lastWeek: number }

export type PostLink = { slug: string; title: string }

export type AdminPostSummary = {
  id: number
  title: string
  slug: string | null
  status: PostStatus
  updatedAt: string
  publishedAt: string | null
  imageCount: number
  coverPublicId: string | null
}

export type PostInput = {
  title: string
  body: string
  status: PostStatus
  images: ImageInput[]
}

export type UploadSignature = {
  cloudName: string
  apiKey: string
  timestamp: number
  folder: string
  allowedFormats: string
  signature: string
}

export type Me = { email: string; displayName: string }

export class ApiError extends Error {
  status: number
  errors: Record<string, string[]>
  body: Record<string, unknown>

  constructor(status: number, body: Record<string, unknown>) {
    super((body.detail as string) ?? (body.title as string) ?? `Request failed (${status})`)
    this.status = status
    this.body = body
    this.errors = (body.errors as Record<string, string[]>) ?? {}
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new ApiError(res.status, data)
  }
  return res.status === 204 ? (undefined as T) : res.json()
}

export const api = {
  login: (email: string, password: string) => request<Me>('POST', '/api/auth/login', { email, password }),
  logout: () => request<void>('POST', '/api/auth/logout'),
  me: () => request<Me>('GET', '/api/auth/me'),
  providers: () => request<{ google: boolean }>('GET', '/api/auth/providers'),

  feed: (query: FeedQuery) => {
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(query)) if (v) params.set(k, v)
    const qs = params.toString()
    return request<FeedPage>('GET', `/api/posts${qs ? `?${qs}` : ''}`)
  },
  profile: () => request<Profile>('GET', '/api/profile'),
  post: (slug: string) => request<PostDetail>('GET', `/api/posts/${encodeURIComponent(slug)}`),
  comments: (slug: string, after?: number) =>
    request<CommentPage>('GET', `/api/posts/${encodeURIComponent(slug)}/comments${after ? `?after=${after}` : ''}`),
  addComment: (slug: string, input: CommentInput) =>
    request<Comment>('POST', `/api/posts/${encodeURIComponent(slug)}/comments`, input),

  adminPosts: () => request<AdminPostSummary[]>('GET', '/api/admin/posts'),
  adminPost: (id: number) => request<PostDetail>('GET', `/api/admin/posts/${id}`),
  createPost: (input: PostInput) => request<PostDetail>('POST', '/api/admin/posts', input),
  updatePost: (id: number, input: PostInput) => request<PostDetail>('PUT', `/api/admin/posts/${id}`, input),
  deletePost: (id: number) => request<void>('DELETE', `/api/admin/posts/${id}`),
  adminComments: (before?: number) =>
    request<AdminCommentPage>('GET', `/api/admin/comments${before ? `?before=${before}` : ''}`),
  deleteComment: (id: number) => request<void>('DELETE', `/api/admin/comments/${id}`),

  uploadSignature: () => request<UploadSignature>('POST', '/api/images/signature'),
}
