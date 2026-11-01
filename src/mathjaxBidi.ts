export interface MathJaxRenderOptions {
    display?: boolean;
    family?: string;
    [key: string]: unknown;
}

type Render = (input: string, options?: MathJaxRenderOptions) => HTMLElement;
type RenderPromise = (input: string, options?: MathJaxRenderOptions) => Promise<HTMLElement>;

export interface MathJaxEngine {
    startup: {
        promise: Promise<unknown>;
        document: {
            outputJax: { options: { mtextInheritFont?: boolean } };
        };
    };
    tex2chtml: Render;
    tex2chtmlPromise?: RenderPromise;
    tex2mml: (input: string) => unknown;
}

/** Use native browser bidi layout for text; preserve mathematical layout. */
export class MathJaxBidiPatcher {
    private active = true;
    private readonly originalRender: Render;
    private readonly originalRenderPromise?: RenderPromise;
    private readonly patchedRender: Render;
    private readonly patchedRenderPromise?: RenderPromise;
    private readonly originalInheritFont: boolean | undefined;

    constructor(
        private readonly mathJax: MathJaxEngine,
        private readonly getTextFont: () => string,
    ) {
        const outputOptions = mathJax.startup.document.outputJax.options;
        this.originalInheritFont = outputOptions.mtextInheritFont;
        this.originalRender = mathJax.tex2chtml;
        this.originalRenderPromise = mathJax.tex2chtmlPromise;

        this.patchedRender = (input, options) => this.prepareText(
            this.originalRender.call(mathJax, input, this.renderOptions(options)),
        );
        if (this.originalRenderPromise) {
            const original = this.originalRenderPromise;
            this.patchedRenderPromise = async (input, options) => this.prepareText(
                await original.call(mathJax, input, this.renderOptions(options)),
            );
        }

        outputOptions.mtextInheritFont = true;
        mathJax.tex2chtml = this.patchedRender;
        if (this.patchedRenderPromise) {
            mathJax.tex2chtmlPromise = this.patchedRenderPromise;
        }
    }

    private renderOptions(options?: MathJaxRenderOptions): MathJaxRenderOptions | undefined {
        if (!this.active) return options;
        // Direct conversion has no surrounding DOM from which to inherit a font.
        return { ...options, family: options?.family || this.getTextFont() };
    }

    private prepareText(node: HTMLElement): HTMLElement {
        if (!this.active) return node;
        if (!node.hasAttribute('dir')) node.setAttribute('dir', 'ltr');
        node.classList.add('mathjax-toolkit-bidi-math');

        // Do not flatten the DOM: preserve nested formatting, math and dimensions.
        for (const text of Array.from(node.querySelectorAll<HTMLElement>(
            'mjx-mtext mjx-utext[variant="-explicitFont"]',
        ))) {
            if (!text.hasAttribute('dir')) text.setAttribute('dir', 'auto');
            text.classList.add('mathjax-toolkit-bidi-text');
        }
        return node;
    }

    destroy(): void {
        if (!this.active) return;
        this.active = false;
        // Do not overwrite a wrapper installed later by another plugin.
        if (this.mathJax.tex2chtml === this.patchedRender) {
            this.mathJax.tex2chtml = this.originalRender;
        }
        if (this.patchedRenderPromise &&
            this.mathJax.tex2chtmlPromise === this.patchedRenderPromise) {
            this.mathJax.tex2chtmlPromise = this.originalRenderPromise;
        }
        const options = this.mathJax.startup.document.outputJax.options;
        if (options.mtextInheritFont === true) {
            if (this.originalInheritFont === undefined) {
                delete options.mtextInheritFont;
            } else {
                options.mtextInheritFont = this.originalInheritFont;
            }
        }
    }
}
