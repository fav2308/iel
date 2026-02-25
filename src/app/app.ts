import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  signal,
} from '@angular/core';
import { initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  signInWithCustomToken,
  type Auth,
  type User,
} from 'firebase/auth';
import {
  addDoc,
  collection,
  getFirestore,
  onSnapshot,
  query,
  serverTimestamp,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore';
import { environment } from '../environments/environment';

declare const __firebase_config: string | undefined;
declare const __app_id: string | undefined;
declare const __initial_auth_token: string | undefined;
declare const __gemini_api_key: string | undefined;

type StatusType = 'error' | 'success' | 'info' | '';

interface Category {
  id: string;
  label: string;
  color: string;
  author: string;
}

type ScoreMap = Record<string, number>;

interface MentoriaRecord {
  id: string;
  menteeName: string;
  scores: ScoreMap;
  analysis: string;
  average: string;
  createdAt?: {
    seconds?: number;
  };
}

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
export class App implements OnInit, OnDestroy {
  protected readonly categories = CATEGORIES;
  protected readonly user = signal<User | null>(null);
  protected readonly menteeName = signal('');
  protected readonly scores = signal<ScoreMap>(createInitialScores());
  protected readonly compareScores = signal<ScoreMap | null>(null);
  protected readonly loading = signal(false);
  protected readonly aiAnalysis = signal('');
  protected readonly history = signal<MentoriaRecord[]>([]);
  protected readonly status = signal<StatusMessage>({ type: '', text: '' });
  protected readonly average = computed(() => {
    const values = Object.values(this.scores());
    const total = values.reduce((accumulator, currentValue) => accumulator + currentValue, 0);
    return (total / this.categories.length).toFixed(1);
  });

  private readonly appId = this.readRuntimeString('__app_id') || environment.appId || 'default-app-id';
  private readonly apiKey = this.readRuntimeString('__gemini_api_key') || environment.geminiApiKey || '';
  private readonly geminiModels = ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-1.5-flash-latest'];
  private readonly firebaseConfig = this.readFirebaseConfig();
  private readonly firebaseApp: FirebaseApp | null = this.firebaseConfig ? initializeApp(this.firebaseConfig) : null;
  private readonly auth: Auth | null = this.firebaseApp ? getAuth(this.firebaseApp) : null;
  private readonly db: Firestore | null = this.firebaseApp ? getFirestore(this.firebaseApp) : null;

  private authUnsubscribe: Unsubscribe | null = null;
  private historyUnsubscribe: Unsubscribe | null = null;

  async ngOnInit(): Promise<void> {
    if (!this.auth || !this.db) {
      this.status.set({
        type: 'info',
        text: 'Firebase não configurado: relatório de IA funciona, mas o histórico não será salvo.',
      });
      return;
    }

    await this.initializeAuth();

    this.authUnsubscribe = onAuthStateChanged(this.auth, (currentUser) => {
      this.user.set(currentUser);
      this.subscribeHistory();
    });
  }

  ngOnDestroy(): void {
    this.authUnsubscribe?.();
    this.historyUnsubscribe?.();
  }

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
    if (!this.menteeName().trim()) {
      this.status.set({ type: 'error', text: 'Insira o nome da mentorada.' });
      return;
    }

    this.loading.set(true);
    this.status.set({ type: 'info', text: 'Gerando inteligência estratégica...' });

    const prompt = `Analise os scores da Roda da Vida de ${this.menteeName()} baseada nos pilares: ${JSON.stringify(
      this.scores(),
    )}. Identifique a alavanca de crescimento principal.`;

    try {
      let analysis = '';

      try {
        analysis = await this.callGemini(prompt);
      } catch (error) {
        analysis = this.generateLocalAnalysis();
        const errorMessage = error instanceof Error ? error.message : 'Falha ao consultar Gemini.';
        this.status.set({
          type: 'info',
          text: `Gemini indisponível no momento. Relatório local gerado. Motivo: ${errorMessage}`,
        });
      }

      this.aiAnalysis.set(analysis);

      if (this.db) {
        await addDoc(collection(this.db, 'artifacts', this.appId, 'public', 'data', 'mentorias'), {
          menteeName: this.menteeName(),
          scores: this.scores(),
          analysis,
          average: this.average(),
          createdAt: serverTimestamp(),
        });

        if (this.status().type !== 'info') {
          this.status.set({ type: 'success', text: 'Relatório gerado e sessão salva com sucesso!' });
        }
      } else {
        if (this.status().type !== 'info') {
          this.status.set({ type: 'success', text: 'Relatório gerado com sucesso! (histórico não salvo)' });
        }
      }
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

  protected restoreSession(item: MentoriaRecord): void {
    this.scores.set(item.scores);
    this.menteeName.set(item.menteeName);
    this.aiAnalysis.set(item.analysis);
    this.compareScores.set(null);
    this.status.set({ type: 'info', text: 'Sessão restaurada para edição.' });
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

  private async initializeAuth(): Promise<void> {
    if (!this.auth) {
      return;
    }

    const initialAuthToken = this.readRuntimeString('__initial_auth_token') || environment.initialAuthToken;

    if (initialAuthToken) {
      await signInWithCustomToken(this.auth, initialAuthToken);
      return;
    }

    await signInAnonymously(this.auth);
  }

  private subscribeHistory(): void {
    if (!this.db || !this.user()) {
      return;
    }

    this.historyUnsubscribe?.();

    const historyQuery = query(collection(this.db, 'artifacts', this.appId, 'public', 'data', 'mentorias'));

    this.historyUnsubscribe = onSnapshot(
      historyQuery,
      (snapshot) => {
        const data = snapshot.docs
          .map((documentSnapshot) => ({ id: documentSnapshot.id, ...(documentSnapshot.data() as Omit<MentoriaRecord, 'id'>) }))
          .sort((firstItem, secondItem) => (secondItem.createdAt?.seconds ?? 0) - (firstItem.createdAt?.seconds ?? 0));

        this.history.set(data);
      },
      () => this.status.set({ type: 'error', text: 'Erro ao carregar histórico.' }),
    );
  }

  private async callGemini(prompt: string): Promise<string> {
    if (!this.apiKey.trim()) {
      throw new Error('Gemini não configurado. Defina NG_APP_GEMINI_API_KEY no .env.');
    }

    const fetchWithRetry = async (model: string, retries = 2, delay = 1000): Promise<string> => {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      let response: Response;

      try {
        response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            systemInstruction: {
              parts: [
                {
                  text: 'Você é uma mentora estratégica para mulheres. Use a bibliografia oficial (Sinek, Brown, etc). Forneça um diagnóstico de alto impacto.',
                },
              ],
            },
          }),
          signal: controller.signal,
        });
      } catch (error) {
        clearTimeout(timeoutId);

        const isAbort = error instanceof DOMException && error.name === 'AbortError';
        if (retries > 0) {
          await new Promise((resolve) => setTimeout(resolve, delay));
          return fetchWithRetry(model, retries - 1, delay * 2);
        }

        if (isAbort) {
          throw new Error('Tempo esgotado ao consultar Gemini. Verifique internet/chave e tente novamente.');
        }

        throw new Error('Falha de rede ao consultar Gemini.');
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        const errorBody = await response.text();
        const compactError = errorBody.length > 180 ? `${errorBody.slice(0, 180)}...` : errorBody;

        if (retries <= 0) {
          throw new Error(`[${response.status}] ${compactError || 'sem detalhes'}`);
        }

        await new Promise((resolve) => setTimeout(resolve, delay));
        return fetchWithRetry(model, retries - 1, delay * 2);
      }

      const data = (await response.json()) as {
        candidates?: Array<{
          content?: {
            parts?: Array<{ text?: string }>;
          };
        }>;
      };

      const analysis = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!analysis?.trim()) {
        throw new Error('Gemini respondeu sem conteúdo de análise.');
      }

      return analysis;
    };

    let lastError = 'Sem detalhes';

    for (const model of this.geminiModels) {
      try {
        return await fetchWithRetry(model);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        lastError = `${model}: ${message}`;

        const fallbackAllowed = message.includes('[503]') || message.includes('[404]') || message.includes('[429]');
        if (!fallbackAllowed) {
          throw new Error(`Falha Gemini (${model}): ${message}`);
        }
      }
    }

    throw new Error(`Gemini indisponível após fallback de modelos. Último erro: ${lastError}`);
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

  private readFirebaseConfig(): FirebaseOptions | null {
    try {
      const runtimeConfig = this.readRuntimeString('__firebase_config');

      if (runtimeConfig) {
        return JSON.parse(runtimeConfig) as FirebaseOptions;
      }

      if (environment.firebaseConfig) {
        return environment.firebaseConfig;
      }
    } catch {
      this.status.set({ type: 'error', text: 'Configuração __firebase_config inválida.' });
    }

    return null;
  }

  private readRuntimeString(key: '__firebase_config' | '__app_id' | '__initial_auth_token' | '__gemini_api_key'): string {
    const runtimeValue = (globalThis as Record<string, unknown>)[key];
    return typeof runtimeValue === 'string' ? runtimeValue : '';
  }
}
