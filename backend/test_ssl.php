<?php
$ch = curl_init("https://www.google.com");
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
$result = curl_exec($ch);
if ($result === false) {
    echo 'Erro: ' . curl_error($ch);
} else {
    echo 'Sucesso!';
}
curl_close($ch);
