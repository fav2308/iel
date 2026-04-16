<?php
// Teste de requisição HTTPS simples usando cURL
$url = 'https://www.google.com';
$ch = curl_init($url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
$result = curl_exec($ch);
if (curl_errno($ch)) {
    echo 'Erro cURL: ' . curl_error($ch) . "\n";
} else {
    echo "Requisição HTTPS bem-sucedida!\n";
}
curl_close($ch);
