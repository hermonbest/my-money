# Database Structure Analysis

## Tables Overview

| table_name         | table_type |
| ------------------ | ---------- |
| expenses           | BASE TABLE |
| inventory          | BASE TABLE |
| profiles           | BASE TABLE |
| sale_items         | BASE TABLE |
| sales              | BASE TABLE |
| stores             | BASE TABLE |
| worker_invitations | BASE TABLE |

## Detailed Table Structures

### 1. Profiles Table
| column_name   | data_type                | is_nullable | column_default     |
| ------------- | ------------------------ | ----------- | ------------------ |
| id            | uuid                     | NO          | uuid_generate_v4() |
| user_id       | uuid                     | NO          | null               |
| role          | character varying        | NO          | null               |
| business_name | character varying        | YES         | null               |
| email         | character varying        | YES         | null               |
| first_name    | character varying        | YES         | null               |
| last_name     | character varying        | YES         | null               |
| store_id      | uuid                     | YES         | null               |
| created_at    | timestamp with time zone | YES         | now()              |
| updated_at    | timestamp with time zone | YES         | now()              |

### 2. Stores Table
| column_name | data_type                | is_nullable | column_default     |
| ----------- | ------------------------ | ----------- | ------------------ |
| id          | uuid                     | NO          | uuid_generate_v4() |
| owner_id    | uuid                     | NO          | null               |
| name        | character varying        | NO          | null               |
| description | text                     | YES         | null               |
| address     | text                     | YES         | null               |
| phone       | character varying        | YES         | null               |
| email       | character varying        | YES         | null               |
| is_active   | boolean                  | YES         | true               |
| created_at  | timestamp with time zone | YES         | now()              |
| updated_at  | timestamp with time zone | YES         | now()              |

### 3. Inventory Table
| column_name         | data_type                | is_nullable | column_default     |
| ------------------- | ------------------------ | ----------- | ------------------ |
| id                  | uuid                     | NO          | uuid_generate_v4() |
| user_id             | uuid                     | NO          | null               |
| store_id            | uuid                     | YES         | null               |
| name                | character varying        | NO          | null               |
| description         | text                     | YES         | null               |
| sku                 | character varying        | YES         | null               |
| category            | character varying        | YES         | null               |
| quantity            | integer                  | NO          | 0                  |
| cost_price          | numeric                  | NO          | 0                  |
| selling_price       | numeric                  | NO          | 0                  |
| is_active           | boolean                  | YES         | true               |
| created_at          | timestamp with time zone | YES         | now()              |
| updated_at          | timestamp with time zone | YES         | now()              |
| minimum_stock_level | integer                  | YES         | 5                  |
| expiration_date     | date                     | YES         | null               |

### 4. Sales Table
| column_name     | data_type                | is_nullable | column_default               |
| --------------- | ------------------------ | ----------- | ---------------------------- |
| id              | uuid                     | NO          | uuid_generate_v4()           |
| user_id         | uuid                     | NO          | null                         |
| store_id        | uuid                     | YES         | null                         |
| sale_number     | character varying        | NO          | null                         |
| customer_name   | character varying        | YES         | null                         |
| customer_email  | character varying        | YES         | null                         |
| customer_phone  | character varying        | YES         | null                         |
| subtotal        | numeric                  | NO          | 0                            |
| tax_amount      | numeric                  | NO          | 0                            |
| discount_amount | numeric                  | NO          | 0                            |
| total_amount    | numeric                  | NO          | 0                            |
| payment_method  | character varying        | YES         | null                         |
| payment_status  | character varying        | YES         | 'pending'::character varying |
| sale_date       | timestamp with time zone | YES         | now()                        |
| created_at      | timestamp with time zone | YES         | now()                        |
| updated_at      | timestamp with time zone | YES         | now()                        |
| notes           | text                     | YES         | null                         |

### 5. Sale Items Table
| column_name      | data_type                | is_nullable | column_default     |
| ---------------- | ------------------------ | ----------- | ------------------ |
| id               | uuid                     | NO          | uuid_generate_v4() |
| sale_id          | uuid                     | NO          | null               |
| user_id          | uuid                     | NO          | null               |
| inventory_id     | uuid                     | NO          | null               |
| item_name        | character varying        | NO          | null               |
| item_description | text                     | YES         | null               |
| quantity         | integer                  | NO          | 1                  |
| unit_price       | numeric                  | NO          | 0                  |
| cost_price       | numeric                  | NO          | 0                  |
| line_total       | numeric                  | NO          | 0                  |
| profit_margin    | numeric                  | YES         | 0                  |
| created_at       | timestamp with time zone | YES         | now()              |

### 6. Expenses Table
| column_name   | data_type                | is_nullable | column_default |
| ------------- | ------------------------ | ----------- | -------------- |
| id            | uuid                     | NO          | uuid_generate_v4() |
| user_id       | uuid                     | NO          | null               |
| store_id      | uuid                     | YES         | null               |
| title         | character varying        | NO          | null               |
| description   | text                     | YES         | null               |
| amount        | numeric                  | NO          | 0                  |
| category      | character varying        | YES         | null               |
| vendor        | character varying        | YES         | null               |
| payment_method| character varying        | YES         | null               |
| expense_date  | date                     | NO          | null               |
| is_recurring  | boolean                  | YES         | false              |
| created_at    | timestamp with time zone | YES         | now()              |
| updated_at    | timestamp with time zone | YES         | now()              |

## Foreign Key Relationships

| table_name         | column_name  | foreign_table_name | foreign_column_name |
| ------------------ | ------------ | ------------------ | ------------------- |
| expenses           | store_id     | stores             | id                  |
| inventory          | store_id     | stores             | id                  |
| sale_items         | inventory_id | inventory          | id                  |
| sale_items         | sale_id      | sales              | id                  |
| sales              | store_id     | stores             | id                  |
| worker_invitations | store_id     | stores             | id                  |

## Row Level Security (RLS) Policies

### Key Policy Patterns:

1. **Individual Users**: Access only their own data (`user_id = auth.uid()`)
2. **Store Owners**: Access to all stores they own (`owner_id = auth.uid()`)
3. **Store Workers**: Access to stores they're assigned to via `profiles.store_id`
4. **Worker Invitations**: Store owners can manage invitations for their stores

### Policy Categories:

- **Individual Management**: Users can manage their personal data
- **Owner Management**: Store owners can manage their stores and related data
- **Worker Access**: Workers can view/update data for assigned stores
- **Store Worker Management**: Owners can manage worker assignments

## Worker Assignment System Analysis

### How Worker Assignment Works

Based on the codebase analysis, the worker assignment system uses a **single-table approach**:

#### **Profiles Table** (Single Assignment Method)
- **`store_id` field**: Directly assigns workers to stores
- **`role` field**: Set to 'worker' for store workers
- **Assignment Method**: Workers are assigned via their profile's `store_id` field
- **Single Source of Truth**: All worker assignments managed through profiles table

### Worker Assignment Flow

#### **Method 1: Direct Profile Assignment**
```javascript
// From StoreContext.js - Workers get their store from profile
if (profile.role === 'worker') {
  if (profile.store_id) {
    // Load the assigned store directly from profile
    const assignedStore = await supabase
      .from('stores')
      .select('*')
      .eq('id', profile.store_id)
      .single();
  }
}
```

#### **Method 2: Invitation System**
1. **Store Owner** creates invitation via `create_worker_invitation` RPC
2. **Worker** receives invitation with token
3. **Worker** accepts invitation via `accept_worker_invitation` RPC
4. **System** updates worker's profile with `store_id`

#### **Method 3: Direct Registration**
1. **Worker** signs up with invitation code
2. **System** calls `complete_worker_registration` RPC
3. **Profile** is created with `role: 'worker'` and `store_id`

### Database Functions Used

#### **1. create_worker_invitation**
```javascript
supabase.rpc('create_worker_invitation', {
  p_store_id: store.id,
  p_worker_email: email,
  p_first_name: firstName,
  p_last_name: lastName,
  p_password: password
});
```

#### **2. accept_worker_invitation**
```javascript
supabase.rpc('accept_worker_invitation', {
  p_token: invitation.invitation_token,
  p_user_id: user.id
});
```

#### **3. complete_worker_registration**
```javascript
supabase.rpc('complete_worker_registration', {
  p_invitation_code: invitationCode,
  p_user_id: user.id
});
```

### Access Control Patterns

#### **Worker Access via Profile**
- Workers access store data through their `profile.store_id`
- RLS policies check `profiles.store_id` for worker access
- Single store assignment per worker
- Simplified and consistent access control

### Key Insights

1. **Single Assignment System**: Only `profiles.store_id` for worker assignments
2. **Simplified Architecture**: Removed redundant `store_workers` table
3. **Invitation Flow**: Email-based invitation system with tokens
4. **Role-Based Security**: RLS policies based on user roles and profile assignments
5. **Single Store Per Worker**: Each worker is assigned to one store via profile
6. **Enhanced Inventory**: Additional fields like `minimum_stock_level` and `expiration_date`
7. **Profit Tracking**: `profit_margin` field in sale_items for financial analysis
8. **Comprehensive Expenses**: Additional fields like `vendor`, `payment_method`, `is_recurring`
9. **Worker Management**: Multiple methods for assigning workers to stores
10. **Security**: RLS policies ensure workers only access their assigned store data
11. **Maintainable**: Single source of truth for worker assignments
12. **Performance**: Simplified queries and faster access control
