import { Lsat } from 'lsat-js'
import { Vector3 } from 'three'
// import { getNodeColorByType } from '~/components/Universe/Graph/constant'
import {
  AWS_IMAGE_BUCKET_URL,
  CLOUDFRONT_IMAGE_BUCKET_URL,
  isDevelopment,
  isE2E,
  NODE_RELATIVE_HIGHLIGHT_COLORS,
} from '~/constants'
import { mock } from '~/mocks/getMockGraphData/mockResponse'
import { api } from '~/network/api'
import { useDataStore } from '~/stores/useDataStore'
import {
  FetchDataResponse,
  FetchSentimentResponse,
  FetchTrendingResponse,
  GraphData,
  Guests,
  Link,
  Node,
  NodeExtended,
} from '~/types'
import { getLSat } from '~/utils/getLSat'
import { getMaxSuperficialWeightPerNodeType, getSuperficialNodeWeight } from '~/utils/getSuperficialNodeWeight'
import { payLsat } from '~/utils/payLsat'
import { getGraphDataPositions } from './const'

type guestMapChild = {
  children: string[]
  imageUrl: string
  name: string
  twitterHandle: string
}

type TeachData = {
  term: string
  transcripts: string
}

/* eslint-disable camelcase */
type QuestionData = {
  search_term: string
  transcripts: string
  expertise_level: string
  question_text: string
}

const defaultData: GraphData = {
  links: [],
  nodes: [],
}

type TopicMapItem = {
  children: string[]
  position: Vector3
}

type TopicMap = Record<string, TopicMapItem>

const shouldIncludeTopics = true
const maxScale = 26

export const fetchGraphData = async (search: string) => {
  try {
    return getGraphData(search)
  } catch (e) {
    return defaultData
  }
}

const fetchNodes = async (search: string): Promise<FetchDataResponse> => {
  if (!search) {
    try {
      const response = await api.get<FetchDataResponse>(`/prediction/content/latest`)

      return response
    } catch (e) {
      console.error(e)

      return mock as FetchDataResponse
    }
  }

  if (isDevelopment || isE2E) {
    const response = await api.get<FetchDataResponse>(`/v2/searching?word=${search}&free=true`)

    return response
  }

  const lsatToken = await getLSat()

  try {
    const response = await api.get<FetchDataResponse>(`/v2/search?word=${search}`, {
      Authorization: lsatToken,
    })

    return response
    // eslint-disable-next-line  @typescript-eslint/no-explicit-any
  } catch (error: any) {
    if (error.status === 402) {
      const lsat = Lsat.fromHeader(error.headers.get('www-authenticate'))

      await payLsat(lsat)

      return fetchNodes(search)
    }

    throw error
  }
}

export const getTrends = async () => {
  const endpoint = `/get_trends`

  const response = await api.get<FetchTrendingResponse>(endpoint)

  return response
}

/**
 *
 * {
 *  cutoff_date: string // String(moment.unix()),
 *  topic: string // search topic
 *  }
 */

export const getSentimentData = async (args?: {
  topic: string
  cutoff_date: string
}): Promise<FetchSentimentResponse> => {
  const search = args && new URLSearchParams(args)

  const endpoint = search ? `/sentiments?${search.toString()}` : '/sentiments'

  // disable payment for tests (data is mocked)
  if (isE2E) {
    const response = await api.get<FetchSentimentResponse>(endpoint)

    return response
  }

  const lsatToken = await getLSat()

  try {
    const response = await api.get<FetchSentimentResponse>(endpoint, {
      Authorization: lsatToken,
    })

    return response

    // eslint-disable-next-line  @typescript-eslint/no-explicit-any
  } catch (error: any) {
    if (error.status === 402) {
      const lsat = Lsat.fromHeader(error.headers.get('www-authenticate'))

      await payLsat(lsat)

      return getSentimentData(args)
    }

    throw error
  }
}

export const postInstagraph = async (data: TeachData): Promise<void> => {
  const lsatToken = await getLSat()

  try {
    await api.post(`/instagraph`, JSON.stringify(data), { Authorization: lsatToken })

    // eslint-disable-next-line  @typescript-eslint/no-explicit-any
  } catch (error: any) {
    if (error.status === 402) {
      const lsat = Lsat.fromHeader(error.headers.get('www-authenticate'))

      await payLsat(lsat)

      await postInstagraph(data)

      return
    }

    throw error
  }
}

export const postTeachMe = async (data: TeachData): Promise<void> => {
  const lsatToken = await getLSat()

  try {
    await api.post(`/teachme`, JSON.stringify(data), { Authorization: lsatToken })

    // eslint-disable-next-line  @typescript-eslint/no-explicit-any
  } catch (error: any) {
    if (error.status === 402) {
      const lsat = Lsat.fromHeader(error.headers.get('www-authenticate'))

      await payLsat(lsat)

      await postTeachMe(data)

      return
    }

    throw error
  }
}

export const postAskQuestion = async (data: QuestionData): Promise<void> => {
  const lsatToken = await getLSat()

  try {
    await api.post(`/ask_question`, JSON.stringify(data), { Authorization: lsatToken })

    // eslint-disable-next-line  @typescript-eslint/no-explicit-any
  } catch (error: any) {
    if (error.status === 402) {
      const lsat = Lsat.fromHeader(error.headers.get('www-authenticate'))

      await payLsat(lsat)

      await postAskQuestion(data)

      return
    }

    throw error
  }
}

export const getAdminId = async (tribeId: string) => {
  const response = await fetch(`https://tribes.sphinx.chat/tribes/${tribeId}`)

  const jsonData = await response.json()

  return jsonData
}

const getNodeScale = (node: NodeExtended) => {
  switch (node.node_type) {
    case 'guest':
    case 'episode':
    case 'document':
      return 2
    case 'show':
      return 3
    default:
      return 1.5
  }
}

function generateTopicNodesFromMap(topicMap: TopicMap, doNodeCallback: (node: NodeExtended) => void) {
  Object.entries(topicMap).forEach(([topic, content], index) => {
    const { children, position } = content
    const { x, y, z } = position
    /** we dont create topic node for search term,
     *  otherwise everything will be linked to it
     */

    const scale = children.length * 2 > maxScale ? maxScale : children.length * 2
    const topicNodeId = `topic_node_${index}`

    const topicNode: NodeExtended = {
      x,
      y,
      z,
      children,
      colors: ['#000'],
      id: topicNodeId,
      label: topic,
      name: topic,
      type: 'topic',
      node_type: 'topic',
      ref_id: topicNodeId,
      scale,
      show_title: topic,
      text: topic,
      weight: 0,
    }

    doNodeCallback(topicNode)
  })
}

function generateGuestNodesFromMap(
  guestMap: Record<string, guestMapChild>,
  doNodeCallback: (node: NodeExtended) => void,
) {
  Object.entries(guestMap).forEach(([guest, guestValue], index) => {
    const guestChildren = guestValue.children
    const scale = guestChildren.length * 2 > maxScale ? maxScale : guestChildren.length * 2
    const guestNodeId = guest || `guestnode_${index}`

    const guestNode: NodeExtended = {
      ...guestValue,
      x: 0,
      y: 0,
      z: 0,
      colors: ['#000'],
      id: guestNodeId,
      image_url: guestValue.imageUrl,
      label: guestValue.name,
      name: guestValue.name,
      node_type: 'guest',
      ref_id: guestNodeId,
      scale,
      show_title: guestValue.name,
      text: guestValue.twitterHandle,
      type: 'guest',
      weight: 0,
    }

    doNodeCallback(guestNode)
  })
}

const getGraphData = async (searchterm: string) => {
  const { graphStyle } = useDataStore.getState()

  let nodes: NodeExtended[] = []

  const topicMap: TopicMap = {}
  const guestMap: Record<string, guestMapChild> = {}

  try {
    const dataInit = await fetchNodes(searchterm)

    const dataSeries = Array.isArray(dataInit.data_series) ? dataInit.data_series : []

    const data: Node[] = [...dataInit.exact, ...dataInit.related, ...dataSeries]

    let topWeightValue = 0

    if (data.length) {
      data.forEach((node, index) => {
        // record highest weight to normalize to range 0~1
        if (node.weight && topWeightValue < node.weight) {
          topWeightValue = node.weight
        }

        // TODO: simplify this to ref_id
        if (['data_series', 'document', 'tweet'].includes(node.node_type)) {
          const imageUrlsMapper: { [key: string]: string } = {
            data_series: 'node_data.webp',
            document: 'document.jpeg',
            tweet: 'twitter_placeholder.png',
          }

          nodes.push({
            ...node,
            scale: getNodeScale(node),
            id: node.tweet_id || `${node.unique_id}_${index}`,
            ref_id: node.tweet_id || `${node.unique_id}_${index}`,
            image_url: imageUrlsMapper[node.node_type],
            type: node.type || node.node_type,
          })

          return
        }

        // reject duplicate nodes
        const notUnique = nodes.find((f) => f.ref_id === node.ref_id)

        if (notUnique) {
          return
        }

        // replace aws bucket url with cloudfront, and add size indicator to end
        const smallImageUrl = node.image_url
          ?.replace(AWS_IMAGE_BUCKET_URL, CLOUDFRONT_IMAGE_BUCKET_URL)
          .replace('.jpg', '_s.jpg')

        nodes.push({
          ...node,
          scale: getNodeScale(node),
          id: node.ref_id || node.tweet_id || node.id,
          image_url: smallImageUrl,
          type: node.type || node.node_type,
        })

        if (node.node_type === 'episode' && node.ref_id) {
          // update guest map
          const guestList = node.guests || []

          guestList.forEach((guest) => {
            const currentGuest = guest as Guests

            if (currentGuest.name && currentGuest.ref_id && node.ref_id) {
              guestMap[currentGuest.ref_id] = {
                children: [...(guestMap[currentGuest.ref_id]?.children || []), node.ref_id],
                imageUrl: currentGuest.profile_picture || '',
                name: currentGuest.name,
                twitterHandle: currentGuest.twitter_handle,
              }
            }
          })
        }
      })
    }

    generateGuestNodesFromMap(guestMap, (n: NodeExtended) => {
      nodes.push(n)
    })

    // extract topics to topic map
    data.forEach((node) => {
      const { topics, ref_id: refId, show_title: showTitle } = node

      if (topics) {
        topics.forEach((topic) => {
          // don't map the search term, all will be tied to it
          if (topic === searchterm) {
            return
          }

          if (showTitle) {
            if (topicMap[topic] && !topicMap[topic].children.includes(refId || showTitle)) {
              topicMap[topic].children.push(refId || showTitle)
            } else {
              topicMap[topic] = {
                position: new Vector3(0, 0, 0),
                children: [refId || showTitle],
              }
            }
          }
        })
      }
    })

    // generate topic nodes
    if (shouldIncludeTopics) {
      generateTopicNodesFromMap(topicMap, (n: NodeExtended) => {
        nodes.push(n)
      })
    }

    // give nodes and links positions based on graphStyle
    const dataWithPositions = getGraphDataPositions(graphStyle, nodes)
    const { links } = dataWithPositions

    nodes = dataWithPositions.nodes

    nodes.sort((a, b) => (b.weight || 0) - (a.weight || 0))

    // re-assign weight based on highest weight value
    // convert to range 0-1

    // for topics and guests, calculate weight based on links
    const maxSuperficialWeight = getMaxSuperficialWeightPerNodeType(nodes, links)

    nodes = addWeightNormalizationToNodes(topWeightValue, maxSuperficialWeight, nodes, links)

    return { links, nodes }
  } catch (e) {
    console.error(e)

    return defaultData
  }
}

const getSegmentColor = (aType: string, bType: string) => {
  if (aType === 'topic' || bType === 'topic') {
    return NODE_RELATIVE_HIGHLIGHT_COLORS.topics.segmentColor
  }

  if (aType === 'guest' || bType === 'guest') {
    return NODE_RELATIVE_HIGHLIGHT_COLORS.guests.segmentColor
  }

  return NODE_RELATIVE_HIGHLIGHT_COLORS.children.segmentColor
}

export const generateLinksFromNodeData = (
  nodes: NodeExtended[],
  childLinksOnlyVisibleOnSelect: boolean,
  guestLinksOnlyVisibleOnSelect: boolean,
) => {
  const links: Link[] = []

  // do links
  nodes.forEach((node) => {
    const { children, guests } = node

    children?.forEach((childRefId: string) => {
      if (node.ref_id) {
        const childNode = nodes.find((f) => f.ref_id === childRefId) || null

        if (!childNode) {
          return
        }

        const sourcePosition = new Vector3(node.x || 0, node.y || 0, node.z || 0)
        const targetPosition = new Vector3(childNode?.x || 0, childNode?.y || 0, childNode?.z || 0)

        links.push({
          onlyVisibleOnSelect: childLinksOnlyVisibleOnSelect,
          color: getSegmentColor(node.node_type, childNode?.node_type || ''),
          source: node.ref_id,
          sourceRef: node.ref_id,
          sourcePosition,
          target: childRefId,
          targetRef: childRefId,
          targetPosition,
        })
      }
    })

    guests?.forEach((guest: string | Guests | null) => {
      if (guest && typeof guest !== 'string' && node.ref_id) {
        const guestNode = nodes.find((f) => f.ref_id === guest?.ref_id) || null

        if (!guestNode) {
          return
        }

        const sourcePosition = new Vector3(node.x || 0, node.y || 0, node.z || 0)
        const targetPosition = new Vector3(guestNode?.x || 0, guestNode?.y || 0, guestNode?.z || 0)

        links.push({
          onlyVisibleOnSelect: guestLinksOnlyVisibleOnSelect,
          color: getSegmentColor(node.node_type, 'guest'),
          source: node.ref_id,
          sourceRef: node.ref_id,
          sourcePosition,
          target: guest?.ref_id,
          targetRef: guest?.ref_id,
          targetPosition,
        })
      }
    })
  })

  return links
}

export const addWeightNormalizationToNodes = (
  topWeightValue: number,
  maxSuperficialWeight: Record<string, number>,
  nodes: NodeExtended[],
  links: Link[],
) =>
  nodes.map((n) => {
    let weight = (n.weight || 0) / topWeightValue

    if (!n.weight && maxSuperficialWeight[n.node_type]) {
      const myWeight = getSuperficialNodeWeight(n, links)

      weight = myWeight / maxSuperficialWeight[n.node_type]
    }

    return {
      ...n,
      weight,
    }
  })
