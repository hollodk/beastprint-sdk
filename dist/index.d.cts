type LegacyPrintOptions = {
    html?: string;
    url?: string;
};
type BeastPrintPrinter = {
    key: string;
    profileKey?: string;
};
type BeastPrintOptions = {
    mode?: 'template' | 'html';
    templateId?: string;
    widthMm?: number;
    data?: Record<string, any>;
    printer?: BeastPrintPrinter;
    html?: string;
};
type PrintStrategy = 'auto' | 'legacy' | 'beast';
type PrintOptions = {
    strategy?: PrintStrategy;
    legacy?: LegacyPrintOptions;
    beast?: BeastPrintOptions;
};
declare function print(options?: PrintOptions): Promise<void>;

export { type BeastPrintOptions, type BeastPrintPrinter, type LegacyPrintOptions, type PrintOptions, type PrintStrategy, print };
