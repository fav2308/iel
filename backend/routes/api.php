<?php

use App\Http\Controllers\GeminiEvaluationController;
use Illuminate\Support\Facades\Route;

Route::options('/gemini/evaluate', fn () => response()->noContent());
Route::post('/gemini/evaluate', GeminiEvaluationController::class);