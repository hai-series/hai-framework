/**
 * =============================================================================
 * @hai/core - 异步操作工具
 * =============================================================================
 */

/**
 * 延迟执行
 */
export function delay(ms: number): Promise<void> {
    return new Promise<void>(resolve => setTimeout(resolve, ms))
}

/**
 * 添加超时限制
 */
export async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), ms))
    return Promise.race([promise, timeout])
}

/**
 * 重试操作
 */
export async function retry<T>(
    fn: () => Promise<T>,
    options: { maxRetries?: number; delay?: number } = {},
): Promise<T> {
    const { maxRetries = 3, delay: retryDelay = 1000 } = options
    let lastError: unknown
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn()
        }
        catch (e) {
            lastError = e
            if (i < maxRetries - 1) await delay(retryDelay)
        }
    }
    throw lastError
}

/**
 * 并行执行，限制并发数
 */
export async function parallel<T, R>(
    items: T[],
    fn: (item: T, index: number) => Promise<R>,
    concurrency = 5,
): Promise<R[]> {
    const results: R[] = []
    let index = 0

    async function worker(): Promise<void> {
        while (index < items.length) {
            const currentIndex = index++
            results[currentIndex] = await fn(items[currentIndex], currentIndex)
        }
    }

    const workers = Array.from(
        { length: Math.min(concurrency, items.length) },
        () => worker(),
    )
    await Promise.all(workers)
    return results
}

/**
 * 串行执行
 */
export async function serial<T, R>(
    items: T[],
    fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
    const results: R[] = []
    for (let i = 0; i < items.length; i++) {
        results.push(await fn(items[i], i))
    }
    return results
}

/**
 * 防抖
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
    fn: T,
    ms: number,
): (...args: Parameters<T>) => void {
    let timer: ReturnType<typeof setTimeout> | null = null
    return (...args: Parameters<T>) => {
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => fn(...args), ms)
    }
}

/**
 * 节流
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
    fn: T,
    ms: number,
): (...args: Parameters<T>) => void {
    let lastTime = 0
    return (...args: Parameters<T>) => {
        const now = Date.now()
        if (now - lastTime >= ms) {
            lastTime = now
            fn(...args)
        }
    }
}
