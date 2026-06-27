export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      servers: {
        Row: {
          id: string
          name: string
          api_url: string
          cert_sha256: string
          created_at: string
          type?: string
          auth_username?: string
          auth_password?: string
          server_type?: 'outline' | 'hysteria2' | '3x-ui'
          username?: string
          password?: string
          inbound_id?: number
        }
        Insert: {
          id?: string
          name: string
          api_url: string
          cert_sha256: string
          created_at?: string
          type?: string
          auth_username?: string
          auth_password?: string
          server_type?: 'outline' | 'hysteria2' | '3x-ui'
          username?: string
          password?: string
          inbound_id?: number
        }
        Update: {
          id?: string
          name?: string
          api_url?: string
          cert_sha256?: string
          created_at?: string
          type?: string
          auth_username?: string
          auth_password?: string
          server_type?: 'outline' | 'hysteria2' | '3x-ui'
          username?: string
          password?: string
          inbound_id?: number
        }
      }
      clients: {
        Row: {
          id: string
          name: string
          sub_token: string
          status: string
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          sub_token?: string
          status?: string
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          sub_token?: string
          status?: string
          created_at?: string
        }
      }
      client_keys: {
        Row: {
          id: string
          client_id: string
          server_id: string
          outline_key_id: string
          access_url: string
          created_at: string
          uuid?: string
        }
        Insert: {
          id?: string
          client_id: string
          server_id: string
          outline_key_id: string
          access_url: string
          created_at?: string
          uuid?: string
        }
        Update: {
          id?: string
          client_id?: string
          server_id?: string
          outline_key_id?: string
          access_url?: string
          created_at?: string
          uuid?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
