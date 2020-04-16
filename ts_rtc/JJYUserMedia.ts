export class JJYUserMedia
{
    static huoqumeiti(): Promise<MediaStream>
    {
        // todo 这里需要修改参数
        return navigator.mediaDevices.getUserMedia({video: true, audio: true})
    }
}
