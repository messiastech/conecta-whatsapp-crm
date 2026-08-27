# Modelagem de Dados e Arquitetura de Persistência

## 1. Visão Geral

O esquema de dados foi projetado para garantir:
1. **Integridade Referencial Estrita**: Relações claras entre Pessoas, Eventos, Presenças, Campanhas, Conversas e Análises de IA.
2. **Deduplicação Determinística**: Chave única de negócio baseada no telefone normalizado em formato internacional E.164 (`normalized_phone`).
3. **Histórico Completo e Imutável**: Trilha de mensagens trocadas e auditoria de ações do sistema.
4. **Portabilidade de Banco de Dados**: Modelado via **Prisma ORM**, permitindo execução local em SQLite sem instalação de serviços adicionais no Windows/Linux/Mac, e migração transparente para PostgreSQL em ambiente de produção via variável `DATABASE_URL`.

---

## 2. Diagrama Entidade-Relacionamento (ERD)

```mermaid
erDiagram
    User ||--o{ AuditLog : "executa"
    Person ||--o{ Attendance : "possui"
    Person ||--o{ Conversation : "inicia/participa"
    Person ||--o{ Message : "recebe/envia"
    Event ||--o{ Attendance : "registra"
    Event ||--o{ Campaign : "origina"
    Campaign ||--o{ Message : "dispara"
    Conversation ||--o{ Message : "agrupa"
    Conversation ||--o{ AIAnalysis : "contextualiza"
    Message ||--o{ AIAnalysis : "analisada_por"

    Person {
        string id PK
        string name
        string phone
        string normalized_phone UK
        string email
        string notes
        boolean opt_out
        datetime created_at
        datetime updated_at
    }

    Event {
        string id PK
        string name
        string description
        datetime event_date
        string location
        int total_attendees
        int total_absentees
        string status
        datetime created_at
        datetime updated_at
    }

    Attendance {
        string id PK
        string person_id FK
        string event_id FK
        boolean invited
        boolean attended
        datetime check_in_time
        string source
        string notes
        datetime created_at
        datetime updated_at
    }

    Campaign {
        string id PK
        string event_id FK
        string name
        string type
        string template_name
        string message_body
        string status
        int total_recipients
        int total_sent
        int total_delivered
        int total_failed
        datetime created_at
        datetime updated_at
    }

    Conversation {
        string id PK
        string person_id FK
        datetime last_message_at
        string status
        boolean requires_human_attention
        string category
        datetime created_at
        datetime updated_at
    }

    Message {
        string id PK
        string conversation_id FK
        string person_id FK
        string campaign_id FK
        string direction
        string provider_message_id UK
        string content
        string status
        string error_message
        datetime sent_at
        datetime delivered_at
        datetime read_at
        datetime created_at
    }

    AIAnalysis {
        string id PK
        string message_id FK
        string conversation_id FK
        string category
        float confidence
        string sentiment
        string summary
        boolean requires_human_attention
        string suggested_reply
        string raw_response
        string model_used
        datetime created_at
    }

    User {
        string id PK
        string name
        string email UK
        string password_hash
        string role
        boolean active
        datetime created_at
        datetime updated_at
    }

    AuditLog {
        string id PK
        string user_id FK
        string action
        string entity_type
        string entity_id
        string details
        string ip_address
        datetime created_at
    }
```

---

## 3. Especificação do Schema Prisma

```prisma
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id           String     @id @default(uuid())
  name         String
  email        String     @unique
  passwordHash String
  role         String     @default("ADMIN") // ADMIN, OPERATOR, VIEWER
  active       Boolean    @default(true)
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt
  auditLogs    AuditLog[]
}

model Person {
  id              String         @id @default(uuid())
  name            String
  phone           String
  normalizedPhone String         @unique // Formato E.164: +5511999999999
  email           String?
  notes           String?
  optOut          Boolean        @default(false)
  optOutAt        DateTime?
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt

  attendances     Attendance[]
  conversations   Conversation[]
  messages        Message[]

  @@index([normalizedPhone])
  @@index([optOut])
}

model Event {
  id              String       @id @default(uuid())
  name            String
  description     String?
  eventDate       DateTime
  location        String?
  totalAttendees  Int          @default(0)
  totalAbsentees  Int          @default(0)
  status          String       @default("COMPLETED") // DRAFT, IN_PROGRESS, COMPLETED
  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt

  attendances     Attendance[]
  campaigns       Campaign[]
}

model Attendance {
  id          String    @id @default(uuid())
  personId    String
  eventId     String
  invited     Boolean   @default(true)
  attended    Boolean   @default(false)
  checkInTime DateTime?
  source      String    @default("CSV_IMPORT")
  notes       String?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  person      Person    @relation(fields: [personId], references: [id], onDelete: Cascade)
  event       Event     @relation(fields: [eventId], references: [id], onDelete: Cascade)

  @@unique([personId, eventId])
  @@index([eventId, attended])
}

model Campaign {
  id              String    @id @default(uuid())
  eventId         String
  name            String
  type            String    // PRESENTE_FOLLOWUP, AUSENTE_FOLLOWUP
  templateName    String?
  messageBody     String
  status          String    @default("DRAFT") // DRAFT, RUNNING, COMPLETED
  totalRecipients Int       @default(0)
  totalSent       Int       @default(0)
  totalDelivered  Int       @default(0)
  totalFailed     Int       @default(0)
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  event           Event     @relation(fields: [eventId], references: [id], onDelete: Cascade)
  messages        Message[]
}

model Conversation {
  id                     String       @id @default(uuid())
  personId               String
  lastMessageAt          DateTime     @default(now())
  status                 String       @default("OPEN") // OPEN, WAITING_REPLY, REPLIED, CLOSED
  requiresHumanAttention Boolean      @default(false)
  category               String?
  createdAt              DateTime     @default(now())
  updatedAt              DateTime     @updatedAt

  person                 Person       @relation(fields: [personId], references: [id], onDelete: Cascade)
  messages               Message[]
  aiAnalyses             AIAnalysis[]

  @@index([personId])
  @@index([requiresHumanAttention])
}

model Message {
  id                String       @id @default(uuid())
  conversationId    String
  personId          String
  campaignId        String?
  direction         String       // OUTBOUND, INBOUND
  providerMessageId String?      @unique
  content           String
  status            String       @default("QUEUED") // QUEUED, SENT, DELIVERED, READ, FAILED
  errorMessage      String?
  sentAt            DateTime?
  deliveredAt       DateTime?
  readAt            DateTime?
  createdAt         DateTime     @default(now())

  conversation      Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  person            Person       @relation(fields: [personId], references: [id], onDelete: Cascade)
  campaign          Campaign?    @relation(fields: [campaignId], references: [id], onDelete: SetNull)
  aiAnalyses        AIAnalysis[]

  @@index([conversationId])
  @@index([personId])
  @@index([status])
}

model AIAnalysis {
  id                     String       @id @default(uuid())
  messageId              String
  conversationId         String
  category               String
  confidence             Float
  sentiment              String
  summary                String
  requiresHumanAttention Boolean      @default(false)
  suggestedReply         String?
  rawResponse            String       @default("{}")
  modelUsed              String
  createdAt              DateTime     @default(now())

  message                Message      @relation(fields: [messageId], references: [id], onDelete: Cascade)
  conversation           Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@index([messageId])
  @@index([conversationId])
  @@index([category])
}

model AuditLog {
  id         String   @id @default(uuid())
  userId     String?
  action     String
  entityType String
  entityId   String?
  details    String   @default("{}")
  ipAddress  String?
  createdAt  DateTime @default(now())

  user       User?    @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@index([action])
  @@index([createdAt])
}
```

---

## 4. Regras de Deduplicação e Importação Idempotente

1. **Chave de Negócio**: O telefone do participante é sanitizado e normalizado para o formato E.164 (`+5511999999999`).
2. **Upsert de Pessoas**: Se o telefone já existir na base, atualiza os dados complementares (ex: nome mais completo ou e-mail), mantendo estritamente preservado o status de `opt_out`.
3. **Associação ao Evento**: Cria ou atualiza o registro na tabela `Attendance` (`UNIQUE(person_id, event_id)`), permitindo re-importações seguras sem duplicar pessoas ou presenças.
