import type { AppLocale } from './index'

export interface ComplianceSection {
  title: string
  body: string[]
}

export interface ComplianceDocument {
  title: string
  updatedAt: string
  sections: ComplianceSection[]
}

export const complianceDocuments: Record<
  AppLocale,
  Record<'privacy' | 'terms' | 'cookie' | 'security', ComplianceDocument>
> = {
  'zh-CN': {
    privacy: {
      title: '隐私政策',
      updatedAt: '2026-05-12',
      sections: [
        {
          title: '数据存储',
          body: ['会话、项目索引、偏好设置和第三方 API Key 默认保存在本地浏览器或本地服务。'],
        },
        {
          title: '用户控制',
          body: ['用户可以清空历史记录、删除导入项目，并随时更新或移除 API Key。'],
        },
      ],
    },
    terms: {
      title: '用户协议',
      updatedAt: '2026-05-12',
      sections: [
        {
          title: '使用边界',
          body: ['用户应遵守适用法律法规，不得使用本产品生成或处理违法、有害或侵权内容。'],
        },
        {
          title: '免责声明',
          body: ['AI 输出可能不准确，重要决策、生产发布和合规判断需人工复核。'],
        },
      ],
    },
    cookie: {
      title: 'Cookie 政策',
      updatedAt: '2026-05-12',
      sections: [
        {
          title: '本地状态',
          body: ['产品会使用本地存储保存登录状态、语言偏好、布局偏好和会话标识。'],
        },
      ],
    },
    security: {
      title: '安全说明',
      updatedAt: '2026-05-12',
      sections: [
        {
          title: '凭证保护',
          body: ['前端对敏感凭证进行本地加密存储，后端请求通过受控接口转发。'],
        },
        {
          title: '文件处理',
          body: ['上传文件会进行类型、大小和哈希校验，并限制可预览和可读取内容范围。'],
        },
      ],
    },
  },
  'en-US': {
    privacy: {
      title: 'Privacy Policy',
      updatedAt: '2026-05-12',
      sections: [
        {
          title: 'Data storage',
          body: [
            'Conversations, project indexes, preferences, and third-party API keys are stored in the local browser or local service by default.',
          ],
        },
        {
          title: 'User control',
          body: [
            'Users can clear history, delete imported projects, and update or remove API keys at any time.',
          ],
        },
      ],
    },
    terms: {
      title: 'Terms of Service',
      updatedAt: '2026-05-12',
      sections: [
        {
          title: 'Acceptable use',
          body: [
            'Users must comply with applicable laws and must not use the product to generate or process unlawful, harmful, or infringing content.',
          ],
        },
        {
          title: 'Disclaimer',
          body: [
            'AI output may be inaccurate. Important decisions, production releases, and compliance judgments require human review.',
          ],
        },
      ],
    },
    cookie: {
      title: 'Cookie Policy',
      updatedAt: '2026-05-12',
      sections: [
        {
          title: 'Local state',
          body: [
            'The product uses local storage for login state, language preference, layout preference, and session identifiers.',
          ],
        },
      ],
    },
    security: {
      title: 'Security Notes',
      updatedAt: '2026-05-12',
      sections: [
        {
          title: 'Credential protection',
          body: [
            'Sensitive credentials are encrypted locally on the frontend, and backend requests are proxied through controlled endpoints.',
          ],
        },
        {
          title: 'File handling',
          body: [
            'Uploaded files are checked by type, size, and hash, with limits on previewable and readable content.',
          ],
        },
      ],
    },
  },
}
