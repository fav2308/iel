# Ascensão • Portal da Mentora (IEL)

Aplicação Angular para mentoria estratégica com:

- avaliação da Roda da Vida Empreendedora (8 pilares);
- geração de parecer por IA (Gemini) com fallback local;
- persistência e histórico de sessões no Firebase (Auth + Firestore);
- visualização em radar e comparação de ciclos anteriores.

## Stack

- Angular 21 (standalone + signals)
- TypeScript
- Firebase Web SDK (`firebase/app`, `firebase/auth`, `firebase/firestore`)
- Gemini API (via `fetch` no cliente)

## Funcionalidades principais

1. **Identificação da mentorada**
2. **Pontuação de 8 pilares** (range de 1 a 10)
3. **Cálculo automático da média global**
4. **Geração de análise estratégica**
	 - prioridade: Gemini
	 - fallback: análise local (quando Gemini falha/indisponível)
5. **Salvamento de sessão no Firestore**
6. **Histórico em tempo real** com restauração e comparação
7. **Cópia do parecer para clipboard**

## Arquitetura (visão rápida)

O fluxo principal está concentrado em `src/app/app.ts`:

- Inicialização:
	- lê configurações de runtime/ambiente;
	- cria Firebase App/Auth/Firestore quando há configuração válida;
	- autentica usuário (token custom ou anônimo).
- Execução:
	- usuário preenche dados e aciona salvar;
	- sistema gera análise (Gemini ou local);
	- persiste documento no Firestore;
	- `onSnapshot` atualiza histórico em tempo real.

## Como o Firebase funciona neste projeto

### 1) Descoberta da configuração

Em `src/environments/environment.ts`, a função `readFirebaseConfigFromEnv()`:

- lê `NG_APP_FIREBASE_CONFIG`;
- retorna `null` se estiver vazio;
- tenta `JSON.parse` quando preenchido;
- retorna `null` se o JSON for inválido.

No componente (`app.ts`), `readFirebaseConfig()` tenta:

1. `__firebase_config` (injeção runtime em `globalThis`)
2. `environment.firebaseConfig`
3. `null` (sem Firebase)

### 2) Inicialização

Com config válida:

- `initializeApp(firebaseConfig)`
- `getAuth(app)`
- `getFirestore(app)`

Sem config válida, o app continua funcionando, mas sem persistência de histórico.

### 3) Autenticação

Em `initializeAuth()`:

- se houver `NG_APP_INITIAL_AUTH_TOKEN` (ou `__initial_auth_token`), usa `signInWithCustomToken`;
- caso contrário, usa `signInAnonymously`.

### 4) Banco (Firestore)

Coleção utilizada:

`artifacts/{appId}/public/data/mentorias`

Na gravação (`handleSave`), salva:

- `menteeName`
- `scores`
- `analysis`
- `average`
- `createdAt: serverTimestamp()`

No histórico (`subscribeHistory`), `onSnapshot(...)` escuta mudanças em tempo real e atualiza a UI.

## Variáveis de ambiente

Use `.env` com base em `.env.example`:

```dotenv
NG_APP_FIREBASE_CONFIG={"apiKey":"SUA_API_KEY","authDomain":"SEU_PROJETO.firebaseapp.com","projectId":"SEU_PROJECT_ID","storageBucket":"SEU_PROJETO.firebasestorage.app","messagingSenderId":"SEU_SENDER_ID","appId":"SEU_APP_ID"}
NG_APP_APP_ID=iel-local
NG_APP_INITIAL_AUTH_TOKEN=
NG_APP_GEMINI_API_KEY=
```

### Descrição

- `NG_APP_FIREBASE_CONFIG`: JSON do projeto Firebase em **uma linha**
- `NG_APP_APP_ID`: namespace lógico usado no caminho dos documentos
- `NG_APP_INITIAL_AUTH_TOKEN`: opcional, para autenticação com token custom
- `NG_APP_GEMINI_API_KEY`: chave para geração de análise com Gemini

> Após alterar `.env`, reinicie o servidor (`ng serve`).

## Execução local

```bash
npm install
npm start
```

Abra `http://localhost:4200/`.

## Build e testes

```bash
npm run build
npm test
```

## Deploy (produção)

A aplicação pode ser hospedada em hosting estático (Firebase Hosting, Vercel, Netlify, etc.), com estes requisitos:

1. variáveis de ambiente corretamente injetadas no build/runtime;
2. domínio de produção autorizado no Firebase Auth;
3. Firestore e regras de segurança configurados para o caminho utilizado;
4. HTTPS (necessário para `navigator.clipboard`).

### Segurança importante

Atualmente a chamada ao Gemini é feita no cliente, então a chave `NG_APP_GEMINI_API_KEY` pode ser exposta no bundle. Para produção, o recomendado é mover a chamada para backend/Cloud Function e manter a chave apenas no servidor.

## Estrutura resumida

```text
src/
	app/
		app.ts          # regra de negócio principal (Firebase, Gemini, histórico)
		app.html        # layout e bindings
		app.scss        # estilos da página
		app.config.ts   # providers globais da aplicação
	environments/
		environment.ts  # leitura das variáveis de ambiente
```

## Notas de manutenção

- O projeto usa uma única rota (`app.routes.ts` vazio no momento).
- O estado de UI é gerenciado com `signal`/`computed`.
- Se Firebase não estiver configurado, o app entra em modo degradado (sem persistência), com mensagem informativa.
