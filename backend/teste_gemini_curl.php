<?php
// Teste de cURL para API Gemini (Google)

$url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=AIzaSyBZERChkFhHHAnPzqo_THTsBZkd6_qjwFo';

$headers = [
    'Content-Type: application/json',
];

// Corpo mínimo para a API Gemini (ajuste conforme necessário)
$data = [
    'contents' => [
        [
            'parts' => [
                ['text' => 'Diga olá!']
            ]
        ]
    ]
];

$ch = curl_init($url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
// Força o uso do cacert.pem configurado no php.ini
// curl_setopt($ch, CURLOPT_CAINFO, __DIR__ . '/cacert.pem'); // Descomente se quiser forçar

$response = curl_exec($ch);
$error = curl_error($ch);
$info = curl_getinfo($ch);
curl_close($ch);

if ($error) {
    echo "Erro cURL: $error\n";
} else {
    echo "Status: {$info['http_code']}\n";
    echo "Resposta:\n$response\n";
}
