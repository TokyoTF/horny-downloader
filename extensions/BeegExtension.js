export default class BeegExtension {
  constructor(ExtensionExtra) {
    this.config = {
      name: 'BEEG',
      color: '#FFCC00b0',
      domains_support: ['beeg.com'],
      domains_includes: ['/-0'],
      embed_preview: '',
      prefix_url: 'beeg.com',
      referer: true,
      format_support: ['hls', 'mp4'],
      vtt_support: false,
      quality_support: ['4k', '1080', '720', '480', '360', '240'],
      version: '1.0.0'
    }
    this.extension = new ExtensionExtra(this.config)
  }

  async extract(url) {
    const videoId = this.extension.extractVideoId(url)
    const req = await fetch(`https://store.externulls.com/facts/file/${videoId}?tag=27173`, {
      redirect: 'follow',
      headers: this.extension.getDefaultHeaders()
    })

    const view = await req.json()

    let video_test = 'https://video.externulls.com/'
    if (view.file.hls_resources) {
      video_test = video_test + view.file.hls_resources.fl_cdn_multi
    } else {
      video_test = video_test + view.fc_facts[0].hls_resources.fl_cdn_multi
    }

    const res_req = await (
      await fetch(video_test, { headers: { Referer: 'https://beeg.com/' } })
    ).text()

    let random_thumb = (Math.random() * view.fc_facts[0].fc_thumbs.length - 1).toFixed(0)
    const thumb_video = view.fc_facts[0].fc_thumbs[random_thumb < 0 ? 0 : random_thumb]

    const res = await this.extension.parseResolutions(
      res_req,
      video_test.slice(0, video_test.indexOf('/media=')),
      { part_special: true }
    )

    return this.extension.createResponse({
      embed: '',
      video_test,
      list_quality: res,
      title: view.file.data[0].cd_value.replace('&period;', '.'),
      time: this.extension.formatDuration(parseInt(view.file.fl_duration)),
      thumb: `https://thumbs.externulls.com/videos/${videoId}/${thumb_video == undefined ? 0 : thumb_video}.webp?size=900x470`,
      status: req.status,
      force_type: 'application/x-mpegurl'
    })
  }
}
