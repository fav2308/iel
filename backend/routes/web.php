<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

use Illuminate\Support\Facades\Http;
Route::get('/test-gemini', function () {
    $apiKey = env('GEMINI_API_KEY');
    $endpoint = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={$apiKey}";

    $response = Http::withOptions(['verify' => false])->post($endpoint, [
        'contents' => [
            [
                'parts' => [
                    ['text' => 'Responda apenas com: OK']
                ]
            ]
        ]
    ]);

    return $response->json();
});
