import { TObject } from 'atonal'
import { MongoConfig, RedisConfig } from 'atonal-db'

export interface IAMConfigs {
  databases: {
    mongodb: MongoConfig
    redis: RedisConfig
  }
  schemas: {
    userProfile: TObject<{}>
  }
  auth: {
    directAccessToken: string
    session: {
      expiresIn: string
      cookie: {
        key?: string
        domain?: string
        signed?: boolean
        httpOnly?: boolean
        maxAge?: number
      }
      token: {
        secret: string
      }
    }
  }
  verification: {
    smsCode: {
      len: number
      format: 'number-only' | 'uppercase-letter-number'
      expiresIn: string
      send: (phoneNumber: string, code: string) => Promise<void>
    }
    emailCode: {
      len: number
      format: 'number-only' | 'uppercase-letter-number'
      expiresIn: string
      send: (email: string, code: string) => Promise<void>
    }
    ticket: {
      len: number
      expiresIn: string
    }
  }
}
