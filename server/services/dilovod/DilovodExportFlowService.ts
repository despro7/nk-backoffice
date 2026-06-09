import { dilovodService } from './DilovodService.js';
import {
  getDilovodExportErrorMessage,
  isDilovodExportError,
  translateDilovodError,
} from './DilovodUtils.js';

export interface DilovodExportFlowOptions<TPayload = any> {
  payload: TPayload;
  dryRun?: boolean;
  warnings?: string[];
  initiatedBy?: string;
  label?: string;
}

export interface DilovodExportFlowResult<TPayload = any> {
  success: boolean;
  dryRun: boolean;
  payload: TPayload;
  warnings: string[];
  dilovodResponse?: any;
  dilovodDocId?: string | null;
  error?: string;
  translatedError?: ReturnType<typeof translateDilovodError>;
}

export class DilovodExportFlowService {
  private normalizeWarnings(warnings?: string[]): string[] {
    return Array.isArray(warnings) ? warnings.filter(Boolean) : [];
  }

  async preview<TPayload = any>(options: DilovodExportFlowOptions<TPayload>): Promise<DilovodExportFlowResult<TPayload>> {
    return {
      success: true,
      dryRun: true,
      payload: options.payload,
      warnings: this.normalizeWarnings(options.warnings),
    };
  }

  async send<TPayload = any>(options: DilovodExportFlowOptions<TPayload>): Promise<DilovodExportFlowResult<TPayload>> {
    const warnings = this.normalizeWarnings(options.warnings);

    if (options.dryRun) {
      return this.preview({ ...options, warnings });
    }

    try {
      const dilovodResponse = await dilovodService.exportToDilovod(options.payload);

      if (isDilovodExportError(dilovodResponse)) {
        const rawError = String(dilovodResponse?.error || dilovodResponse?.message || getDilovodExportErrorMessage(dilovodResponse));
        return {
          success: false,
          dryRun: false,
          payload: options.payload,
          warnings,
          dilovodResponse,
          error: rawError,
          translatedError: translateDilovodError(rawError),
        };
      }

      return {
        success: true,
        dryRun: false,
        payload: options.payload,
        warnings,
        dilovodResponse,
        dilovodDocId: dilovodResponse?.id != null ? String(dilovodResponse.id) : null,
      };
    } catch (error) {
      const rawError = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        dryRun: false,
        payload: options.payload,
        warnings,
        error: rawError,
        translatedError: translateDilovodError(rawError),
      };
    }
  }
}

export const dilovodExportFlowService = new DilovodExportFlowService();
