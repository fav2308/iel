import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewChild,
  computed,
  signal,
} from '@angular/core';
import type { jsPDF } from 'jspdf';
import { environment } from '../environments/environment';
declare const __app_id: string | undefined;

type StatusType = 'error' | 'success' | 'info' | '';

interface Category {
  id: string;
  label: string;
  color: string;
  author: string;
}

type ScoreMap = Record<string, number>;



interface StatusMessage {
  type: StatusType;
  text: string;
}

const CATEGORIES: Category[] = [
  { id: 'estrategia', label: 'Estratégia e visão', color: '#6366f1', author: 'Sinek' },
  { id: 'processos', label: 'Processos e operação', color: '#06b6d4', author: 'Ries' },
  { id: 'marketing', label: 'Marketing e posicionamento', color: '#10b981', author: 'Kotler' },
  { id: 'vendas', label: 'Vendas e faturamento', color: '#f59e0b', author: 'Kanze' },
  { id: 'financas', label: 'Finanças e lucratividade', color: '#8b5cf6', author: 'Dornelas' },
  { id: 'equipe', label: 'Liderança e equipe', color: '#ef4444', author: 'Sandberg' },
  { id: 'mindset', label: 'Mindset e resiliência', color: '#ec4899', author: 'Dweck' },
  { id: 'equilibrio', label: 'Equilíbrio vida-trabalho', color: '#64748b', author: 'Clear' },
];

function createInitialScores(): ScoreMap {
  return CATEGORIES.reduce<ScoreMap>((accumulator, category) => {
    accumulator[category.id] = 5;
    return accumulator;
  }, {});
}

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  @ViewChild('radarChart') private readonly radarChart?: ElementRef<SVGSVGElement>;

  protected readonly categories = CATEGORIES;
  protected readonly menteeName = signal('');
  protected readonly scores = signal<ScoreMap>(createInitialScores());
  protected readonly compareScores = signal<ScoreMap | null>(null);
  protected readonly loading = signal(false);
  protected readonly pdfLoading = signal(false);
  protected readonly aiAnalysis = signal('');
  protected readonly status = signal<StatusMessage>({ type: '', text: '' });
  protected readonly average = computed(() => {
    const values = Object.values(this.scores());
    const total = values.reduce((accumulator, currentValue) => accumulator + currentValue, 0);
    return (total / this.categories.length).toFixed(1);
  });

  private readonly appId = this.readRuntimeString('__app_id') || environment.appId || 'default-app-id';
  private readonly backendBaseUrl = 'http://127.0.0.1:8000';

  protected updateMenteeName(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.menteeName.set(target.value);
  }

  protected updateScore(categoryId: string, event: Event): void {
    const target = event.target as HTMLInputElement;
    const value = Number.parseInt(target.value, 10);
    this.scores.update((currentScores) => ({
      ...currentScores,
      [categoryId]: Number.isNaN(value) ? 1 : value,
    }));
  }

  protected async handleSave(): Promise<void> {
    const menteeName = this.menteeName().trim();

    if (!menteeName) {
      this.status.set({ type: 'error', text: 'Insira o nome da mentorada.' });
      return;
    }

    this.loading.set(true);

    const localAnalysis = this.generateLocalAnalysis();
    this.aiAnalysis.set(localAnalysis);
    this.status.set({ type: 'info', text: 'Prévia pronta. Refinando o relatório com IA...' });

    try {
      let finalAnalysis = localAnalysis;
      let usedLocalFallback = false;
      let fallbackReason = '';

      try {
        finalAnalysis = await this.generateRemoteAnalysis();
      } catch (remoteError) {
        usedLocalFallback = true;
        fallbackReason = remoteError instanceof Error ? remoteError.message : 'A IA não respondeu a tempo.';
      }

      this.aiAnalysis.set(finalAnalysis);

      this.status.set({
        type: usedLocalFallback ? 'info' : 'success',
        text: usedLocalFallback
          ? `Prévia exibida sem demora. Mantive a versão local porque a IA principal não respondeu (${fallbackReason}).`
          : 'Relatório gerado com sucesso! Clique em "Gerar PDF" para baixar.',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao processar análise.';
      this.status.set({ type: 'error', text: message });
    } finally {
      this.loading.set(false);
    }
  }

  protected newSession(): void {
    this.scores.set(createInitialScores());
    this.compareScores.set(null);
    this.aiAnalysis.set('');
    this.menteeName.set('');
    this.status.set({ type: '', text: '' });
  }

  protected setComparison(scores: ScoreMap): void {
    this.compareScores.set(scores);
  }

  protected async copyToClipboard(): Promise<void> {
    const text = `Mentoria: ${this.menteeName()}\n\nDiagnóstico IA:\n${this.aiAnalysis()}`;

    try {
      await navigator.clipboard.writeText(text);
      this.status.set({ type: 'success', text: 'Copiado para o clipboard!' });
    } catch {
      this.status.set({ type: 'error', text: 'Não foi possível copiar o texto.' });
    }
  }

  protected async exportPdf(): Promise<void> {
    if (!this.aiAnalysis().trim()) {
      this.status.set({ type: 'error', text: 'Gere o parecer antes de exportar o PDF.' });
      return;
    }

    this.pdfLoading.set(true);
    this.status.set({ type: 'info', text: 'Montando PDF para impressão...' });

    try {
      const { jsPDF: JsPdfConstructor } = await import('jspdf');
      const documentPdf = new JsPdfConstructor({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const now = new Date();
      const reportTitle = `Parecer de Mentoria - ${this.menteeName() || 'Mentorada'}`;

      documentPdf.setFont('helvetica', 'bold');
      documentPdf.setFontSize(16);
      documentPdf.text(reportTitle, 14, 18);
      documentPdf.setFont('helvetica', 'normal');
      documentPdf.setFontSize(10);
      documentPdf.text(`Data: ${now.toLocaleDateString('pt-BR')}`, 14, 24);
      documentPdf.text(`Media global: ${this.average()}/10`, 14, 29);

      const radarImage = await this.createRadarImage();
      if (radarImage) {
        documentPdf.setFont('helvetica', 'bold');
        documentPdf.setFontSize(12);
        documentPdf.text('Grafico Radar', 14, 38);
        documentPdf.addImage(radarImage, 'PNG', 14, 42, 85, 85);
      }

      this.drawScoreBars(documentPdf, 108, 44, 92, 80);

      const analysisStartY = 138;
      documentPdf.setFont('helvetica', 'bold');
      documentPdf.setFontSize(12);
      documentPdf.text('Parecer de Mentoria', 14, analysisStartY);

      documentPdf.setFont('helvetica', 'normal');
      documentPdf.setFontSize(10);
      const wrappedAnalysis = documentPdf.splitTextToSize(this.aiAnalysis(), 182);
      documentPdf.text(wrappedAnalysis, 14, analysisStartY + 6);

      const fileDate = now.toISOString().slice(0, 10);
      const safeName = (this.menteeName() || 'mentorada')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      documentPdf.save(`parecer-mentoria-${safeName || 'mentorada'}-${fileDate}.pdf`);

      this.status.set({ type: 'success', text: 'PDF gerado com sucesso!' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nao foi possivel gerar o PDF.';
      this.status.set({ type: 'error', text: message });
    } finally {
      this.pdfLoading.set(false);
    }
  }

  protected getPoints(data: ScoreMap | null): string {
    if (!data) {
      return '';
    }

    const center = 175;
    const radius = 100;

    return this.categories
      .map((category, index) => {
        const angle = (index * 360) / this.categories.length - 90;
        const categoryScore = data[category.id] ?? 1;
        const scaledRadius = (categoryScore / 10) * radius;
        const x = center + scaledRadius * Math.cos((angle * Math.PI) / 180);
        const y = center + scaledRadius * Math.sin((angle * Math.PI) / 180);
        return `${x},${y}`;
      })
      .join(' ');
  }

  protected axisLine(index: number): { x: number; y: number; labelX: number; labelY: number } {
    const angle = (index * 360) / this.categories.length - 90;
    const angleRadians = (angle * Math.PI) / 180;

    return {
      x: 175 + 100 * Math.cos(angleRadians),
      y: 175 + 100 * Math.sin(angleRadians),
      labelX: 175 + 125 * Math.cos(angleRadians),
      labelY: 175 + 125 * Math.sin(angleRadians),
    };
  }

  protected scorePoint(category: Category, index: number): { x: number; y: number; noteX: number; noteY: number } {
    const angle = (index * 360) / this.categories.length - 90;
    const angleRadians = (angle * Math.PI) / 180;
    const radius = ((this.scores()[category.id] ?? 1) / 10) * 100;

    return {
      x: 175 + radius * Math.cos(angleRadians),
      y: 175 + radius * Math.sin(angleRadians),
      noteX: 175 + (radius + 15) * Math.cos(angleRadians),
      noteY: 175 + (radius + 15) * Math.sin(angleRadians),
    };
  }

  protected labelFirstWord(label: string): string {
    return label.split(' ')[0] ?? label;
  }



  private async generateRemoteAnalysis(): Promise<string> {
    return this.callBackend();
  }

  private async callBackend(): Promise<string> {
    let response: Response;

    try {
      response = await fetch(`${this.backendBaseUrl}/api/gemini/evaluate`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mentee_name: this.menteeName().trim(),
          scores: this.scores(),
        }),
      });
    } catch {
      throw new Error('Falha de rede ao consultar o backend Laravel.');
    }

    const responseText = await response.text();
    const responseData = this.parseBackendResponse(responseText);

    if (!response.ok) {
      const message = responseData.message || responseText || 'Falha ao consultar o backend Laravel.';
      throw new Error(typeof message === 'string' ? message : 'Falha ao consultar o backend Laravel.');
    }

    const analysis = responseData.analysis;

    if (!analysis?.trim()) {
      throw new Error('Backend respondeu sem conteúdo de análise.');
    }

    try {
      JSON.parse(analysis);
    } catch {
      throw new Error('Backend retornou análise sem JSON válido.');
    }

    return analysis;
  }

  private parseBackendResponse(responseText: string): { analysis?: string; message?: string; details?: unknown } {
    if (!responseText.trim()) {
      return {};
    }

    try {
      return JSON.parse(responseText) as { analysis?: string; message?: string; details?: unknown };
    } catch {
      return { message: responseText };
    }
  }


  private drawScoreBars(documentPdf: jsPDF, originX: number, originY: number, width: number, height: number): void {
    const scores = this.scores();
    const maxScore = 10;
    const maxBarWidth = width - 28;
    const rowHeight = height / this.categories.length;

    documentPdf.setFont('helvetica', 'bold');
    documentPdf.setFontSize(12);
    documentPdf.text('Grafico de Pontuacao', originX, originY - 6);

    this.categories.forEach((category, index) => {
      const score = scores[category.id] ?? 0;
      const shortLabel = this.labelFirstWord(category.label);
      const lineY = originY + index * rowHeight;
      const barWidth = (score / maxScore) * maxBarWidth;

      documentPdf.setFont('helvetica', 'normal');
      documentPdf.setFontSize(9);
      documentPdf.setTextColor(30, 41, 59);
      documentPdf.text(shortLabel, originX, lineY + 3);

      documentPdf.setDrawColor(203, 213, 225);
      documentPdf.setFillColor(241, 245, 249);
      documentPdf.roundedRect(originX + 24, lineY - 1, maxBarWidth, 4, 1, 1, 'FD');

      const [r, g, b] = this.hexToRgb(category.color);
      documentPdf.setFillColor(r, g, b);
      documentPdf.roundedRect(originX + 24, lineY - 1, barWidth, 4, 1, 1, 'F');

      documentPdf.setFontSize(8);
      documentPdf.text(`${score}/10`, originX + width - 4, lineY + 3, { align: 'right' });
    });
  }

  private async createRadarImage(): Promise<string | null> {
    const svgElement = this.radarChart?.nativeElement;
    if (!svgElement) {
      return null;
    }

    const viewBox = svgElement.viewBox.baseVal;
    const width = Math.max(Math.round(viewBox.width || svgElement.clientWidth || 350), 300);
    const height = Math.max(Math.round(viewBox.height || svgElement.clientHeight || 350), 300);

    const serialized = new XMLSerializer().serializeToString(svgElement);
    const svgBlob = new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);

    try {
      const image = await this.loadImage(svgUrl);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext('2d');
      if (!context) {
        return null;
      }

      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);

      return canvas.toDataURL('image/png');
    } finally {
      URL.revokeObjectURL(svgUrl);
    }
  }

  private loadImage(source: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Nao foi possivel processar o grafico para o PDF.'));
      image.src = source;
    });
  }

  private hexToRgb(hexColor: string): [number, number, number] {
    const normalized = hexColor.replace('#', '');
    const isShortHex = normalized.length === 3;
    const fullHex = isShortHex
      ? normalized
        .split('')
        .map((character) => `${character}${character}`)
        .join('')
      : normalized;

    const value = Number.parseInt(fullHex, 16);
    if (Number.isNaN(value)) {
      return [79, 70, 229];
    }

    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  }

  private generateLocalAnalysis(): string {
    const scores = this.scores();
    const ordered = [...this.categories].sort((firstCategory, secondCategory) => {
      return (scores[firstCategory.id] ?? 0) - (scores[secondCategory.id] ?? 0);
    });

    const weakest = ordered[0];
    const strongest = ordered[ordered.length - 1];
    const weakestScore = weakest ? scores[weakest.id] ?? 0 : 0;
    const strongestScore = strongest ? scores[strongest.id] ?? 0 : 0;
    const average = this.average();

    return [
      `Diagnóstico Estratégico (modo local) — ${this.menteeName()}`,
      `Média global atual: ${average}/10.`,
      weakest
        ? `Principal alavanca de crescimento: ${weakest.label} (${weakestScore}/10). Priorize ações de curto prazo nesta frente nos próximos 14 dias.`
        : 'Principal alavanca de crescimento: definir foco prioritário para os próximos 14 dias.',
      strongest
        ? `Ponto de força para tracionar resultados: ${strongest.label} (${strongestScore}/10). Use esta área como motor para acelerar as demais.`
        : 'Ponto de força: consolidar uma área com desempenho acima da média para gerar tração.',
      'Plano de ação recomendado:',
      `1) Definir uma meta objetiva para ${weakest?.label ?? 'a alavanca principal'} com indicador semanal.`,
      '2) Executar um sprint de 2 semanas com rotina de revisão diária (15 minutos).',
      '3) Revisar evolução dos 8 pilares e recalibrar prioridades ao final do ciclo.',
    ].join('\n\n');
  }

  private readRuntimeString(key: '__app_id'): string {
    const runtimeValue = (globalThis as Record<string, unknown>)[key];
    return typeof runtimeValue === 'string' ? runtimeValue : '';
  }
}
