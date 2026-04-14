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
        'gemini-1.5-flash',
        'gemini-1.5-flash-latest',
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
        $requestBuilder = Http::timeout(20)->acceptJson();

        if (app()->environment('local')) {
            $requestBuilder = $requestBuilder->withOptions([
                // Desenvolvimento local no Windows sem cadeia CA configurada.
                'verify' => false,
            ]);
        }

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
            '- identificar a principal Area Alavanca',
            '- explicar o impacto sistemico da area prioritaria',
            '- sugerir oportunidades de promocao',
            '- sugerir de 1 a 3 acoes praticas imediatas',
            'Regras obrigatorias:',
            '- usar exclusivamente a rubrica recebida no systemInstruction',
            '- nao inventar criterios ou areas fora da rubrica',
            '- responder apenas com JSON valido',
            '- nao usar Markdown',
            '- nao escrever texto antes ou depois do JSON',
        ]);
    }
}