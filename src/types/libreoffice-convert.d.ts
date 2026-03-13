declare module 'libreoffice-convert' {
    export function convert(
        document: Buffer,
        format: string,
        filter: string | undefined,
        callback: (err: Error | null, done: Buffer) => void
    ): void;
}
