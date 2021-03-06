import { Type, useAuthGuards, useRouter } from 'atonal'
import { keyGuard } from '../middlewares'
import { useSessionProvider } from '../providers'

const sessionProvider = useSessionProvider()

const router = useRouter({
  middlewares: [
    useAuthGuards({
      guards: [keyGuard],
    }),
  ],
})

router.put('/objects/:key', {
  schema: {
    params: Type.Object({
      key: Type.String(),
    }),
    body: Type.Object({
      value: Type.Optional(Type.Record(Type.String(), Type.Any())),
    }),
  },
  handler: async req => {
    const { key } = req.params
    const { value } = req.body

    return sessionProvider.instance.setObject(key, value)
  },
})

router.get('/objects/:key', {
  schema: {
    params: Type.Object({
      key: Type.String(),
    }),
  },
  handler: async req => {
    const { key } = req.params
    const value = await sessionProvider.instance.getObject(key)

    return { value }
  },
})

router.delete('/objects/:key', {
  schema: {
    params: Type.Object({
      key: Type.String(),
    }),
  },
  handler: async req => {
    const { key } = req.params

    return sessionProvider.instance.deleteObject(key)
  },
})

router.post('/sids', {
  schema: {
    body: Type.Object({
      key: Type.String(),
    }),
  },
  handler: async req => {
    const { key } = req.body
    const sid = await sessionProvider.instance.createSID(key)

    return { sid }
  },
})

router.get('/sids/:sid', {
  schema: {
    params: Type.Object({
      sid: Type.String(),
    }),
  },
  handler: async req => {
    const { sid } = req.params
    const value = await sessionProvider.instance.getObjectBySID(sid)

    return { value }
  },
})

router.delete('/sids/:sid', {
  schema: {
    params: Type.Object({
      sid: Type.String(),
    }),
  },
  handler: async req => {
    const { sid } = req.params

    return sessionProvider.instance.deleteSID(sid)
  },
})

export default router
