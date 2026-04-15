// Remover export duplicado e garantir que objectKeys está dentro da classe correta
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewChild,
  computed,
  signal,
} from '@angular/core';
import { NgClass, NgIf, NgFor } from '@angular/common';
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
  standalone: true,
  imports: [NgClass, NgIf, NgFor],
})
export class App {
  @ViewChild('radarChart') private readonly radarChart?: ElementRef<SVGSVGElement>;

  protected readonly categories = CATEGORIES;
  protected readonly menteeName = signal('');
  protected readonly scores = signal<ScoreMap>(createInitialScores());
  // Removido teste de status
  constructor() {}
  protected readonly compareScores = signal<ScoreMap | null>(null);
  protected readonly loading = signal(false);
  protected readonly pdfLoading = signal(false);
  protected readonly aiAnalysis = signal('');
  protected readonly aiTips = signal<string[]>([]);
  protected readonly aiParsed = signal<any>(null);
  // Lista de campos permitidos para exibição
  private readonly allowedFields = [
    'anamnese',
    'comentarios_pilares',
    'area_alavanca',
    'impacto_sistemico',
    'oportunidades',
    'acoes',
    'recursos',
    'temas_proximas_sessoes',
    'perguntas_reflexao',
    'historia_inspiradora',
    'checklist',
    'alertas_bem_estar',
    'networking',
    'pontos_fortes',
    'plano_smart',
  ];
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

    this.aiAnalysis.set('');
    this.aiTips.set([]);
    this.status.set({ type: 'info', text: 'Enviando dados para a IA...' });

    try {
      // Tenta chamar a IA normalmente
      const result = await this.generateRemoteAnalysis();
      const parsed = JSON.parse(result);
      // Filtra apenas os campos permitidos
      const filtered: any = {};
      for (const key of this.allowedFields) {
        if (parsed[key] !== undefined) filtered[key] = parsed[key];
      }
      this.aiParsed.set(filtered);
      this.aiAnalysis.set(JSON.stringify(filtered, null, 2));
      // Procura campos comuns para dicas/sugestões/ações
      const tips =
        filtered.acoes || filtered.dicas || filtered.sugestoes || filtered.sugestao || filtered.tips || [];
      if (Array.isArray(tips)) {
        this.aiTips.set(tips.filter((t) => typeof t === 'string' && t.trim().length > 0));
      } else if (typeof tips === 'string' && tips.trim().length > 0) {
        this.aiTips.set([tips]);
      } else {
        this.aiTips.set([]);
      }
      this.status.set({ type: 'success', text: 'Relatório gerado com sucesso! Clique em "Gerar PDF" para baixar.' });
    } catch (error) {
      // Se a IA estiver fora do ar ou erro de rede, apenas avisa a usuária
      this.aiAnalysis.set('');
      this.aiParsed.set(null);
      this.aiTips.set([]);
      this.status.set({
        type: 'error',
        text: 'Não foi possível realizar o exame porque a inteligência artificial está fora do ar. Tente novamente mais tarde.',
      });
    } finally {
      this.loading.set(false);
    }
  }

  protected newSession(): void {
    this.scores.set(createInitialScores());
    this.compareScores.set(null);
    this.aiAnalysis.set('');
    this.aiTips.set([]);
    this.aiParsed.set(null);
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
    if (!this.aiParsed()) {
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
      documentPdf.text(`Média global: ${this.average()}/10`, 14, 29);

      const radarImage = await this.createRadarImage();
      if (radarImage) {
        documentPdf.setFont('helvetica', 'bold');
        documentPdf.setFontSize(12);
        documentPdf.text('Gráfico Radar', 14, 38);
        documentPdf.addImage(radarImage, 'PNG', 14, 42, 85, 85);
      }

      this.drawScoreBars(documentPdf, 108, 44, 92, 80);

      const analysisStartY = 138;
      documentPdf.setFont('helvetica', 'bold');
      documentPdf.setFontSize(12);
      documentPdf.text('Parecer de Mentoria', 14, analysisStartY);

      documentPdf.setFont('helvetica', 'normal');
      documentPdf.setFontSize(10);
      let y = analysisStartY + 6;
      const analysis = this.aiParsed();

      // Anamnese
      if (analysis.anamnese) {
        documentPdf.setFont('helvetica', 'bold');
        documentPdf.setFontSize(11);
        documentPdf.text('Anamnese:', 14, y);
        y += 7;
        documentPdf.setFont('helvetica', 'normal');
        documentPdf.setFontSize(10);
        // Divide a anamnese em frases usando pontuação como delimitador
        const frases = analysis.anamnese.split(/(?<=[.!?])\s+/);
        for (const frase of frases) {
          const wrapped = documentPdf.splitTextToSize(frase.trim(), 182);
          documentPdf.text(wrapped, 14, y);
          y += 6 * wrapped.length;
        }
        y += 2;
      }

      // Média Global
      if (analysis.media_global) {
        documentPdf.setFont('helvetica', 'bold');
        documentPdf.setFontSize(11);
        documentPdf.text('Média Global:', 14, y);
        documentPdf.setFont('helvetica', 'normal');
        documentPdf.setFontSize(10);
        documentPdf.text(`${analysis.media_global}/10`, 50, y);
        y += 8;
      }

      // Principal Alavanca
      if (analysis.principal_alavanca) {
        documentPdf.setFont('helvetica', 'bold');
        documentPdf.setFontSize(11);
        documentPdf.text('Principal Alavanca:', 14, y);
        documentPdf.setFont('helvetica', 'normal');
        documentPdf.setFontSize(10);
        documentPdf.text(analysis.principal_alavanca, 60, y);
        y += 8;
      }

      // Ponto Forte
      if (analysis.ponto_forte) {
        documentPdf.setFont('helvetica', 'bold');
        documentPdf.setFontSize(11);
        documentPdf.text('Ponto Forte:', 14, y);
        documentPdf.setFont('helvetica', 'normal');
        documentPdf.setFontSize(10);
        documentPdf.text(analysis.ponto_forte, 50, y);
        y += 8;
      }

      // Plano de Ação
      if (analysis.plano_acao && Array.isArray(analysis.plano_acao)) {
        y += 2;
        documentPdf.setFont('helvetica', 'bold');
        documentPdf.setFontSize(11);
        documentPdf.text('Plano de Ação:', 14, y);
        y += 7;
        documentPdf.setFont('helvetica', 'normal');
        documentPdf.setFontSize(10);
        analysis.plano_acao.forEach((acao: string, idx: number) => {
          const wrapped = documentPdf.splitTextToSize(`${idx + 1}. ${acao}`, 170);
          documentPdf.text(wrapped, 18, y);
          y += 6 * wrapped.length;
        });
      }

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

  private formatAnalysisLinesForPdf(analysis: any): string[] {
    const lines: string[] = [];
    if (analysis.anamnese) {
      lines.push('Anamnese:');
      lines.push(analysis.anamnese);
      lines.push('');
    }
    if (analysis.media_global) {
      lines.push(`Média Global: ${analysis.media_global}/10`);
    }
    if (analysis.principal_alavanca) {
      lines.push(`Principal Alavanca: ${analysis.principal_alavanca}`);
    }
    if (analysis.ponto_forte) {
      lines.push(`Ponto Forte: ${analysis.ponto_forte}`);
    }
    if (analysis.plano_acao && Array.isArray(analysis.plano_acao)) {
      lines.push('');
      lines.push('Plano de Ação:');
      analysis.plano_acao.forEach((acao: string, idx: number) => {
        lines.push(`  ${idx + 1}. ${acao}`);
      });
    }
    return lines;
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

  private parseBackendResponse(responseText: string): any {
    if (!responseText.trim()) {
      return {};
    }

    try {
      return JSON.parse(responseText);
    } catch {
      return { message: responseText };
    }
  }


  private drawScoreBars(
    documentPdf: any,
    originX: number,
    originY: number,
    width: number,
    height: number
  ): void {
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

      const rgb = this.hexToRgb(category.color);
      documentPdf.setFillColor(rgb.r, rgb.g, rgb.b);
      documentPdf.roundedRect(originX + 24, lineY - 1, barWidth, 4, 1, 1, 'F');

      documentPdf.setFontSize(8);
      documentPdf.text(`${score}/10`, originX + width - 4, lineY + 3, { align: 'right' });
    });
  }

  private async createRadarImage(): Promise<string | undefined> {
    const svgElement = this.radarChart?.nativeElement;
    if (!svgElement) {
      return undefined;
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
        return undefined;
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

  private hexToRgb(hexColor: string): { r: number; g: number; b: number } {
    const normalized = hexColor.replace('#', '');
    const isShortHex = normalized.length === 3;
    const fullHex = isShortHex
      ? normalized
        .split('')
        .map((character: string) => `${character}${character}`)
        .join('')
      : normalized;

    const value = Number.parseInt(fullHex, 16);
    if (Number.isNaN(value)) {
      // Cor padrão (roxinho)
      return { r: 79, g: 70, b: 229 };
    }

    return {
      r: (value >> 16) & 255,
      g: (value >> 8) & 255,
      b: value & 255,
    };
  }

  private generateLocalAnalysisJson() {
    const scores = this.scores();
    const ordered = [...this.categories].sort((firstCategory, secondCategory) => {
      return (scores[firstCategory.id] ?? 0) - (scores[secondCategory.id] ?? 0);
    });

    const weakest = ordered[0];
    const strongest = ordered[ordered.length - 1];
    const weakestScore = weakest ? scores[weakest.id] ?? 0 : 0;
    const strongestScore = strongest ? scores[strongest.id] ?? 0 : 0;
    const average = this.average();

    // Gera anamnese local simples
    const anamnese = `Esta anamnese foi gerada localmente, sem IA. A mentorada ${this.menteeName()} apresenta média global de ${average}/10. O principal ponto de atenção é "${weakest.label}" (${weakestScore}/10), enquanto o maior ponto forte é "${strongest.label}" (${strongestScore}/10). Recomenda-se priorizar ações de curto prazo na área de menor nota e usar o ponto forte como alavanca para o desenvolvimento.`;

    return {
      anamnese,
      media_global: average,
      principal_alavanca: weakest
        ? `${weakest.label} (${weakestScore}/10)`
        : 'Definir foco prioritário para os próximos 14 dias.',
      ponto_forte: strongest
        ? `${strongest.label} (${strongestScore}/10)`
        : 'Consolidar uma área com desempenho acima da média para gerar tração.',
      plano_acao: [
        `Definir uma meta objetiva para ${weakest?.label ?? 'a alavanca principal'} com indicador semanal.`,
        'Executar um sprint de 2 semanas com rotina de revisão diária (15 minutos).',
        'Revisar evolução dos 8 pilares e recalibrar prioridades ao final do ciclo.'
      ]
    };
  }

  private readRuntimeString(key: string): string | undefined {
    const runtimeValue = (globalThis as any)[key];
    return typeof runtimeValue === 'string' ? runtimeValue : '';
  }

  public objectKeys(obj: object): string[] {
    return obj ? Object.keys(obj) : [];
  }
}
