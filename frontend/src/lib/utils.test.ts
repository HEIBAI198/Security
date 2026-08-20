import { describe, expect, it } from 'vitest'
import { formatLocalDateTime, getPageNumbers } from './utils'

describe('formatLocalDateTime', () => {
  it('按指定时区转换 UTC ISO 时间', () => {
    expect(formatLocalDateTime('2026-08-20T06:19:00+00:00', { timeZone: 'Asia/Shanghai' }))
      .toBe('2026-08-20 14:19')
  })

  it('可显示秒并处理空值', () => {
    expect(formatLocalDateTime('2026-08-20T06:19:07Z', {
      includeSeconds: true,
      timeZone: 'Asia/Shanghai',
    })).toBe('2026-08-20 14:19:07')
    expect(formatLocalDateTime(null, { fallback: '' })).toBe('')
  })
})

describe('getPageNumbers', () => {
  it('returns all pages when total is at most 5', () => {
    expect(getPageNumbers(1, 3)).toEqual([1, 2, 3])
    expect(getPageNumbers(3, 5)).toEqual([1, 2, 3, 4, 5])
  })

  it('shows ellipsis near the beginning', () => {
    expect(getPageNumbers(1, 10)).toEqual([1, 2, 3, 4, '...', 10])
    expect(getPageNumbers(3, 10)).toEqual([1, 2, 3, 4, '...', 10])
  })

  it('shows ellipsis near the end', () => {
    expect(getPageNumbers(10, 10)).toEqual([1, '...', 7, 8, 9, 10])
    expect(getPageNumbers(9, 10)).toEqual([1, '...', 7, 8, 9, 10])
  })

  it('shows ellipsis on both side in the middle', () => {
    expect(getPageNumbers(5, 10)).toEqual([1, '...', 4, 5, 6, '...', 10])
  })

  it('handles current page greater than total pages', () => {
    expect(getPageNumbers(6, 5)).toEqual([1, 2, 3, 4, 5])
    expect(getPageNumbers(11, 10)).toEqual([1, '...', 7, 8, 9, 10])
  })
})
