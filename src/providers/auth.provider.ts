import { hashPassword, sha1, Unauthorized, useInstance } from 'atonal'
import { ObjectId } from 'atonal-db'
import { IAMConfigs } from '../common/configs'
import { UserState } from '../types'
import { CaptchaProvider } from './captcha.provider'
import { SessionProvider } from './session.provider'
import { UserProvider } from './user.provider'

const captchaProvider = useInstance<CaptchaProvider>('IAM.provider.captcha')
const sessionProvider = useInstance<SessionProvider>('IAM.provider.session')
const userProvider = useInstance<UserProvider>('IAM.provider.user')

export class AuthProvider {
  constructor(private configs: IAMConfigs) {}

  async getSessionBySID(sid: string) {
    const payload = await sessionProvider.instance.getObjectBySID(sid)

    if (payload === null) {
      throw new Unauthorized('invalid sid')
    }

    if (payload._id) {
      Object.assign(payload, {
        _id: ObjectId.createFromHexString(payload._id),
      })
    }

    await this.configs.hooks?.onGetSession?.(payload as UserState)

    return payload as UserState
  }

  async getSessionByToken(token: string) {
    const sid = this.verifyToken(token)
    const user = await this.getSessionBySID(sid)

    return { sid, user }
  }

  async refreshSession(userId: ObjectId) {
    const key = userId.toHexString()
    const hasSession = await sessionProvider.instance.hasObject(key)

    if (hasSession) {
      const user = await this.getUserState(userId)

      await sessionProvider.instance.setObject(key, user)
    }
  }

  async signUpWithPhoneNumber(
    phoneNumber: string,
    ticket: string,
    password?: string,
  ) {
    await captchaProvider.instance.verifyTicket(ticket, `sms:${phoneNumber}`)

    return userProvider.instance.createUser({
      phoneNumber,
      phoneNumberVerified: true,
      password,
    })
  }

  async signUpWithUsername(username: string, password: string) {
    return userProvider.instance.createUser({ username, password })
  }

  async signUpWithEmail(email: string, password: string) {
    return userProvider.instance.createUser({ email, password })
  }

  async signInWithPhoneNumberAndToken(phoneNumber: string, ticket: string) {
    await captchaProvider.instance.verifyTicket(ticket, `sms:${phoneNumber}`)

    const user = await userProvider.instance.getRawUserBy({ phoneNumber })

    if (!user) {
      throw new Unauthorized('invalid credentials')
    }

    return this.handleSignIn(user._id)
  }

  async signInWithPhoneNumberAndPassword(
    phoneNumber: string,
    password: string,
  ) {
    const user = await userProvider.instance.getRawUserBy({ phoneNumber })

    if (!user || hashPassword(password + user.salt) !== user.pwdHash) {
      throw new Unauthorized('invalid credentials')
    }

    return this.handleSignIn(user._id)
  }

  async signInWithUsername(username: string, password: string) {
    const user = await userProvider.instance.getRawUserBy({ username })

    if (!user || hashPassword(password + user.salt) !== user.pwdHash) {
      throw new Unauthorized('invalid credentials')
    }

    return this.handleSignIn(user._id)
  }

  async signInWithEmail(email: string, password: string) {
    const user = await userProvider.instance.getRawUserBy({ email })

    if (!user || hashPassword(password + user.salt) !== user.pwdHash) {
      throw new Unauthorized('invalid credentials')
    }

    return this.handleSignIn(user._id)
  }

  async signOut(sid: string, user?: UserState) {
    await sessionProvider.instance.deleteSID(sid)

    if (user) {
      await this.configs.hooks?.onSignIn?.(user)
    }

    return { success: true }
  }

  async signOutAll(userId: ObjectId, user?: UserState) {
    await sessionProvider.instance.deleteObject(userId.toHexString())

    if (user) {
      await this.configs.hooks?.onSignIn?.(user)
    }

    return { success: true }
  }

  async bindPhoneNumber(userId: ObjectId, phoneNumber: string, ticket: string) {
    await captchaProvider.instance.verifyTicket(ticket, `sms:${phoneNumber}`)

    const user = await userProvider.instance.updateUser(userId, {
      phoneNumber,
      phoneNumberVerified: true,
    })

    await this.refreshSession(user._id)

    return { success: true }
  }

  async bindEmail(userId: ObjectId, email: string, ticket: string) {
    await captchaProvider.instance.verifyTicket(ticket, `email:${email}`)

    const user = await userProvider.instance.updateUser(userId, {
      email,
      emailVerified: true,
    })

    await this.refreshSession(user._id)

    return { success: true }
  }

  async changePassword(
    userId: ObjectId,
    password: string,
    newPassword: string,
  ) {
    const user = await userProvider.instance.getRawUserBy({ _id: userId })

    if (!user || hashPassword(password + user.salt) !== user.pwdHash) {
      throw new Unauthorized('invalid credentials')
    }

    await userProvider.instance.updateUser(user._id, {
      pwdHash: hashPassword(newPassword + user.salt),
    })

    await sessionProvider.instance.deleteObject(userId.toHexString())

    return { success: true }
  }

  async resetPasswordByEmail(email: string, password: string, ticket: string) {
    await captchaProvider.instance.verifyTicket(ticket, `email:${email}`)

    const user = await userProvider.instance.getRawUserBy({ email })

    if (!user) {
      throw new Unauthorized('invalid credentials')
    }

    await userProvider.instance.updateUser(user._id, {
      pwdHash: hashPassword(password + user.salt),
    })

    return { success: true }
  }

  async resetPasswordByPhoneNumber(
    phoneNumber: string,
    password: string,
    ticket: string,
  ) {
    await captchaProvider.instance.verifyTicket(ticket, `sms:${phoneNumber}`)

    const user = await userProvider.instance.getRawUserBy({ phoneNumber })

    if (!user) {
      throw new Unauthorized('invalid credentials')
    }

    await userProvider.instance.updateUser(user._id, {
      pwdHash: hashPassword(password + user.salt),
    })

    return { success: true }
  }

  private async getUserState(userId: ObjectId): Promise<UserState> {
    const user = await userProvider.instance.getRawUserBy({ _id: userId })

    if (!user) {
      throw new Unauthorized('user is not found')
    }

    if (user.blocked) {
      throw new Unauthorized('user has been blocked')
    }

    return {
      _id: user._id,
      permissions: user.permissions ?? [],
      roles: user.roles ?? [],
      emailVerified: user.emailVerified,
      phoneNumberVerified: user.phoneNumberVerified,
    }
  }

  private async handleSignIn(userId: ObjectId) {
    const user = await this.getUserState(userId)
    const key = user._id.toHexString()

    await sessionProvider.instance.setObject(key, user)

    const sid = await sessionProvider.instance.createSID(key)
    const token = this.signToken(sid)

    await this.configs.hooks?.onSignIn?.(user)

    return { sid, token, user }
  }

  private verifyToken(token: string) {
    const { secret } = this.configs.auth.session.token
    const payload = Buffer.from(token, 'base64url').toString()
    const [sid, signature] = payload.split(':')

    if (!sid || !signature) {
      throw new Unauthorized('invalid token: parse error')
    }

    if (signature !== sha1(sid + secret)) {
      throw new Unauthorized('invalid token: signature is not matched')
    }

    return sid
  }

  private signToken(sid: string) {
    const { secret } = this.configs.auth.session.token
    const payload = `${sid}:${sha1(sid + secret)}`

    return Buffer.from(payload).toString('base64url')
  }
}

export const useAuthProvider = () =>
  useInstance<AuthProvider>('IAM.provider.auth')
