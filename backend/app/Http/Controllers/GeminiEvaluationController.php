<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Http;
use Throwable;

class GeminiEvaluationController extends Controller
{
    /**
     * @var array<string, string>
     */
    private array $categories = [
        'estrategia' => 'Estratégia e visão',
        'processos' => 'Processos e operação',
        'marketing' => 'Marketing e posicionamento',
        'vendas' => 'Vendas e faturamento',
        'financas' => 'Finanças e lucratividade',
        'equipe' => 'Liderança e equipe',
        'mindset' => 'Mindset e resiliência',
        'equilibrio' => 'Equilíbrio vida-trabalho',
    ];

    /**
     * @var string[]
     */
    private array $models = [
        'gemini-2.5-flash',
    ];

    public function __invoke(Request $request): JsonResponse
    {
        $payload = $request->validate([
            'mentee_name' => ['required', 'string'],
            'scores' => ['required', 'array'],
            'scores.*' => ['required', 'numeric', 'between:1,10'],
        ]);

        if (array_diff(array_keys($this->categories), array_keys($payload['scores']))) {
            return response()->json([
                'message' => 'As pontuações enviadas não contêm todas as áreas esperadas.',
            ], 422);
        }

        $apiKey = trim((string) env('GEMINI_API_KEY', ''));
        $systemInstruction = $this->buildSystemInstruction();
        $prompt = $this->buildPrompt($payload['mentee_name'], $payload['scores']);

        if ($apiKey === '') {
            return response()->json([
                'message' => 'Gemini não configurado no backend. Defina GEMINI_API_KEY no .env do Laravel.',
            ], 500);
        }

        if ($systemInstruction === '') {
            return response()->json([
                'message' => 'Rubrica não encontrada no backend.',
            ], 500);
        }

        $lastError = 'Sem detalhes';
        // Força o uso do cacert.pem específico para validação SSL
        $requestBuilder = Http::timeout(20)->acceptJson();

        foreach ($this->models as $model) {
            try {
                $response = $requestBuilder
                    ->post(
                        "https://generativelanguage.googleapis.com/v1beta/models/{$model}:generateContent?key={$apiKey}",
                        [
                            'contents' => [
                                [
                                    'parts' => [
                                        ['text' => $prompt],
                                    ],
                                ],
                            ],
                            'systemInstruction' => [
                                'parts' => [
                                    ['text' => $systemInstruction],
                                ],
                            ],
                        ],
                    );
            } catch (Throwable $exception) {
                return response()->json([
                    'message' => 'Falha de conexão do backend com o Gemini.',
                    'details' => $exception->getMessage(),
                ], 502);
            }

            if (! $response->successful()) {
                $lastError = sprintf('[%s] %s', $response->status(), $response->body());

                if (! in_array($response->status(), [404, 429, 503], true)) {
                    return response()->json([
                        'message' => "Falha Gemini ({$model}).",
                        'details' => $response->json() ?: $response->body(),
                    ], $response->status());
                }

                continue;
            }

            $responseData = $response->json();
            $analysis = data_get($responseData, 'candidates.0.content.parts.0.text');

            if (! is_string($analysis) || trim($analysis) === '') {
                return response()->json([
                    'message' => 'Gemini respondeu sem conteúdo de análise.',
                    'details' => $responseData,
                ], 502);
            }

            json_decode($analysis, true);

            if (json_last_error() !== JSON_ERROR_NONE) {
                return response()->json([
                    'message' => 'Gemini não retornou JSON válido.',
                    'analysis' => $analysis,
                ], 502);
            }

            return response()->json([
                'analysis' => $analysis,
            ]);
        }

        return response()->json([
            'message' => 'Gemini indisponível após fallback de modelos.',
            'details' => $lastError,
        ], 502);
    }

    private function buildSystemInstruction(): string
    {
        $rubricPath = resource_path('prompts/rubrica-avaliacao.md');

        if (! File::exists($rubricPath)) {
            return '';
        }

        $rubricText = trim((string) File::get($rubricPath));

        if ($rubricText === '') {
            return '';
        }

        return implode("\n", [
            'Você é uma avaliadora estratégica do programa de mentoria para mulheres do IEL.',
            'Use exclusivamente a rubrica abaixo para interpretar as notas informadas.',
            'Não invente critérios, escalas, pesos, áreas ou regras fora da rubrica.',
            'Responda apenas com JSON válido.',
            'Não use Markdown.',
            'Não escreva texto antes ou depois do JSON.',
            '',
            'Rubrica de avaliação:',
            $rubricText,
        ]);
    }

    /**
     * @param array<string, int|float|string> $scores
     */
    private function buildPrompt(string $menteeName, array $scores): string
    {
        $normalizedScores = [];

        foreach ($this->categories as $key => $label) {
            $normalizedScores[$label] = (float) ($scores[$key] ?? 0);
        }

        return implode("\n", [
            'Mentorada: ' . trim($menteeName),
            'Tarefa: interpretar as notas da Roda da Vida com base exclusivamente na rubrica carregada.',
            'Scores informados: ' . json_encode($normalizedScores, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            'Objetivo:',
            '- realizar uma anamnese detalhada, levantando possíveis causas, histórico e contexto para os resultados apresentados',
            '- comentar individualmente cada pilar, destacando pontos fortes e pontos de atenção',
            '- identificar a principal Area Alavanca',
            '- explicar o impacto sistêmico da área prioritária',
            '- sugerir oportunidades de promoção e desenvolvimento',
            '- sugerir de 1 a 3 ações práticas imediatas, com dicas concretas e exemplos aplicáveis à realidade da mentorada',
            '- indicar recursos, cursos gratuitos, redes de apoio, comunidades e eventos voltados para mulheres empreendedoras',
            '- sugerir temas para próximas sessões de mentoria e perguntas de reflexão',
            '- trazer uma história inspiradora de mulher empreendedora que superou desafios semelhantes',
            '- gerar um checklist prático de próximos passos',
            '- incluir alertas de autoconfiança, bem-estar e valorização das conquistas',
            '- sugerir ações de networking e grupos/setores para conexão',
            '- destacar as áreas em que a mentorada já se destaca, reforçando autoestima e potencial',
            '- propor um plano de ação SMART (específico, mensurável, alcançável, relevante e com prazo)',
            'Regras obrigatórias:',
            '- usar exclusivamente a rubrica recebida no systemInstruction para análise dos pilares',
            '- para dicas, sugestões, recursos e histórias, pode buscar inspiração livremente no conhecimento do Gemini, sempre considerando o contexto da mentorada',
            '- não inventar critérios ou áreas fora da rubrica para a análise principal',
            '- responder apenas com JSON válido, estruturando cada item em campos separados',
            '- não usar Markdown',
            '- não escrever texto antes ou depois do JSON',
        ]);
    }
}